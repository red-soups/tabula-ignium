-- 산불 이력 확인서 in SQL (PostgreSQL + PostGIS). Same results as apps/model/fsml/report.py, which stays the
-- reference: compare with packages/shared-schemas/examples/*.json (README section 5).
--
-- 1. Table + function: add as a Flyway migration (e.g. V11). Load exports/backend/korea/korea_fire_points.zip.
-- 2. Item queries: run per statement with :area (geometry, 4326), :through (last observed day, e.g. 2026-11-13),
--    :start / :end (requested period). Texts for C1–C4 and the item titles: report-static.json.

-- ============================================================ 1. table
CREATE TABLE korea_fire_points (
    sensor TEXT, satellite TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    acq_date DATE, acq_time_utc CHAR(4), confidence TEXT, confidence_level TEXT, frp REAL, daynight CHAR(1),
    bright_fire REAL, bright_bg REAL, scan REAL, track REAL, version TEXT, type SMALLINT, type_inferred SMALLINT,
    data_source TEXT,
    acq_datetime_kst TIMESTAMP, period CHAR(7), cell_row SMALLINT, cell_col SMALLINT, fine_row SMALLINT, fine_col SMALLINT,
    source TEXT, carrier SMALLINT,
    weight DOUBLE PRECISION, weight_low DOUBLE PRECISION, weight_high DOUBLE PRECISION,
    frp_weight DOUBLE PRECISION, frp_weight_low DOUBLE PRECISION, frp_weight_high DOUBLE PRECISION,
    geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED
);
CREATE INDEX idx_korea_fire_points_geom ON korea_fire_points USING GIST (geom);
CREATE INDEX idx_korea_fire_points_acq_date ON korea_fire_points (acq_date);
CREATE INDEX idx_korea_fire_points_period ON korea_fire_points (period);
-- Load (every column but geom, in the CSV's order):
-- \copy korea_fire_points (sensor, satellite, latitude, longitude, acq_date, acq_time_utc, confidence, confidence_level, frp, daynight, bright_fire, bright_bg, scan, track, version, type, type_inferred, data_source, acq_datetime_kst, period, cell_row, cell_col, fine_row, fine_col, source, carrier, weight, weight_low, weight_high, frp_weight, frp_weight_low, frp_weight_high) FROM 'korea_fire_points.csv' CSV HEADER

-- ============================================================ 2. monthly record of one area
-- Every month 2000-11 … :through, months without a point = 0. `percentile` ranks a month against the same
-- calendar month 2003–2023 on whole detections (round half to even; PostgreSQL's round(float8) does that), ties
-- count half; a month still in progress is ranked on its projected total. Levels: <10, <30, <70, <90, ≥90.
CREATE OR REPLACE FUNCTION fire_monthly(p_area GEOMETRY, p_through DATE)
RETURNS TABLE (period DATE, source TEXT, harmonized DOUBLE PRECISION, low DOUBLE PRECISION, high DOUBLE PRECISION,
               harmonized_frp DOUBLE PRECISION, frp_low DOUBLE PRECISION, frp_high DOUBLE PRECISION,
               modis_n BIGINT, viirs_n BIGINT, days_observed INT, projected DOUBLE PRECISION,
               normal DOUBLE PRECISION, percentile DOUBLE PRECISION, level TEXT)
LANGUAGE sql STABLE AS $$
WITH pts AS (
    SELECT k.* FROM korea_fire_points k WHERE ST_Intersects(k.geom, p_area)
),
months AS (
    SELECT d::date AS m FROM generate_series(DATE '2000-11-01', CAST(date_trunc('month', p_through) AS date), INTERVAL '1 month') d
),
sums AS (
    SELECT mo.m,
           CASE WHEN mo.m < DATE '2002-07-01' THEN 'terra_scaled' WHEN mo.m <= DATE '2024-12-01' THEN 'modis'
                ELSE 'viirs_model' END AS src,
           COALESCE(SUM(p.weight), 0) AS h, SUM(p.weight_low) AS lo, SUM(p.weight_high) AS hi,
           SUM(p.frp_weight) AS f, SUM(p.frp_weight_low) AS flo, SUM(p.frp_weight_high) AS fhi,
           COUNT(p.sensor) FILTER (WHERE p.sensor = 'MODIS') AS nm, COUNT(p.sensor) FILTER (WHERE p.sensor = 'VIIRS') AS nv
    FROM months mo LEFT JOIN pts p ON p.period = to_char(mo.m, 'YYYY-MM')
    GROUP BY mo.m
),
monthly AS (
    SELECT m, src, h,
           CASE WHEN src = 'viirs_model' THEN COALESCE(lo, 0) END AS lo,
           CASE WHEN src = 'viirs_model' THEN COALESCE(hi, 0) END AS hi,
           CASE WHEN src = 'terra_scaled' THEN NULL ELSE COALESCE(f, 0) END AS f,
           CASE WHEN src = 'viirs_model' THEN COALESCE(flo, 0) END AS flo,
           CASE WHEN src = 'viirs_model' THEN COALESCE(fhi, 0) END AS fhi,
           nm, CASE WHEN m >= DATE '2012-01-01' THEN nv END AS nv,
           CASE WHEN m = CAST(date_trunc('month', p_through) AS date) AND p_through < (m + INTERVAL '1 month - 1 day')::date
                THEN EXTRACT(DAY FROM p_through)::int END AS days
    FROM sums
),
ranked AS (
    SELECT mo.*, mo.h * EXTRACT(DAY FROM mo.m + INTERVAL '1 month - 1 day') / mo.days AS proj,
           EXTRACT(MONTH FROM mo.m)::int AS mon
    FROM monthly mo
),
base AS (
    SELECT EXTRACT(MONTH FROM m)::int AS mon, h, round(h::float8) AS rb
    FROM monthly WHERE EXTRACT(YEAR FROM m) BETWEEN 2003 AND 2023
),
normals AS (
    SELECT mon, percentile_cont(0.5) WITHIN GROUP (ORDER BY h) AS nrm, COUNT(*) AS n FROM base GROUP BY mon
),
pct AS (
    SELECT r.*, n.nrm,
           CASE WHEN n.n >= 5 THEN
               (SELECT 100.0 * (COUNT(*) FILTER (WHERE b.rb < v) + 0.5 * COUNT(*) FILTER (WHERE b.rb = v)) / COUNT(*)
                FROM base b WHERE b.mon = r.mon)
           END AS pc
    FROM ranked r
    CROSS JOIN LATERAL (SELECT round(COALESCE(r.proj, r.h)::float8) AS v) val
    LEFT JOIN normals n ON n.mon = r.mon
)
SELECT m, src, h, lo, hi, f, flo, fhi, nm, nv, days, proj, nrm, pc,
       CASE WHEN pc IS NULL THEN NULL WHEN pc < 10 THEN '매우 낮음' WHEN pc < 30 THEN '낮음' WHEN pc < 70 THEN '보통'
            WHEN pc < 90 THEN '높음' ELSE '매우 높음' END
FROM pct ORDER BY m
$$;

-- ============================================================ 3. items
-- :area for a project (regions it selected):
--   (SELECT ST_Union(r.boundary) FROM project_regions pr JOIN regions r ON r.id = pr.region_id WHERE pr.project_id = :projectId)
-- :area for a radius around a site:
--   ST_Buffer(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius_km * 1000)::geometry

-- B2 월별 달력
SELECT to_char(period, 'YYYY-MM') AS period, harmonized, low, high, normal, percentile, level, days_observed, projected, source
FROM fire_monthly(:area, :through)
WHERE period BETWEEN CAST(date_trunc('month', CAST(:start AS date)) AS date) AND CAST(:end AS date) ORDER BY period;

-- B1 연도별 화재 추이 / B6 불 세기 이력 / B7 센서 교체 보정 (one query, pick the columns per item)
-- complete: 12 months on record and not the year still running (unless :through is 12-31).
WITH y AS (
    SELECT EXTRACT(YEAR FROM period)::int AS year, SUM(harmonized) AS harmonized, SUM(low) AS low, SUM(high) AS high,
           SUM(harmonized_frp) AS harmonized_frp, COUNT(harmonized_frp) AS frp_months,
           SUM(modis_n) AS raw_modis, SUM(viirs_n) AS raw_viirs, COUNT(*) AS months,
           array_agg(DISTINCT source ORDER BY source) AS sources
    FROM fire_monthly(:area, :through) GROUP BY 1
)
SELECT year, harmonized, low, high, sources,
       months = 12 AND NOT (year = EXTRACT(YEAR FROM CAST(:through AS date)) AND to_char(CAST(:through AS date), 'MM-DD') <> '12-31') AS complete,
       harmonized_frp,                                                                   -- B6
       CASE WHEN harmonized >= 1 THEN harmonized_frp / harmonized END AS mw_per_detection,  -- B6
       frp_months = 12 AS frp_complete,                                                  -- B6 complete = complete AND this
       raw_modis, raw_viirs,                                                             -- B7
       CASE WHEN year < 2012 THEN raw_modis ELSE COALESCE(raw_viirs, 0) END AS raw_stitched   -- B7
FROM y ORDER BY year;
-- B7 raw_viirs_to_modis_ratio = SUM(raw_viirs) / SUM(raw_modis) over years 2012–2024 with raw_modis > 0.

-- B3 큰 산불 발생 빈도: months of 2001–2025 with harmonized ≥ max(3 × normal, 5).
-- return_period_years = 25 / number of years (NULL when none); years_with_any_fire = years of 2001–2025 with a total ≥ 1.
SELECT EXTRACT(YEAR FROM period)::int AS year
FROM fire_monthly(:area, :through)
WHERE EXTRACT(YEAR FROM period) BETWEEN 2001 AND 2025 AND harmonized >= GREATEST(3 * COALESCE(normal, 0), 5)
GROUP BY 1 ORDER BY 1;
-- largest_months (times_normal NULL when the normal is 0):
SELECT to_char(period, 'YYYY-MM') AS period, harmonized, harmonized / NULLIF(normal, 0) AS times_normal
FROM fire_monthly(:area, :through)
WHERE EXTRACT(YEAR FROM period) BETWEEN 2001 AND 2025 AND harmonized > 0 ORDER BY harmonized DESC, period LIMIT 3;

-- B4 고위험 시기: normal-years mean per calendar month; high risk where share ≥ 1.5 / 12; peak = largest mean.
WITH m AS (
    SELECT EXTRACT(MONTH FROM period)::int AS month, AVG(harmonized) AS mean
    FROM fire_monthly(:area, :through) WHERE EXTRACT(YEAR FROM period) BETWEEN 2003 AND 2023 GROUP BY 1
)
SELECT month, mean, COALESCE(mean / NULLIF(SUM(mean) OVER (), 0), 0) AS share,
       COALESCE(mean / NULLIF(SUM(mean) OVER (), 0), 0) >= 1.5 / 12 AS high_risk
FROM m ORDER BY month;

-- B5 최근 추세: from the B1 query, L = last complete year;
-- recent_mean = mean harmonized of complete years L-4 … L, baseline_mean = mean of complete years 2003–2023,
-- ratio = recent_mean / baseline_mean, last_year_ratio = harmonized(L) / baseline_mean (NULL when baseline_mean is 0).

-- A1 화재 감지 목록 (A2 maps the same rows). Satellite names: T/Terra → Terra, A/Aqua → Aqua, N → Suomi NPP,
-- N20 → NOAA-20, N21 → NOAA-21. MODIS and VIIRS see the same fires: show both, never add their counts.
SELECT sensor, satellite, to_char(acq_datetime_kst, 'YYYY-MM-DD HH24:MI') AS acq_datetime_kst, latitude, longitude,
       confidence_level, frp, daynight, data_source
FROM korea_fire_points
WHERE ST_Intersects(geom, :area) AND acq_date BETWEEN :start AND :end
ORDER BY acq_datetime_kst, sensor LIMIT 5000;

-- A3 가장 가까운 화재: from the area's centre (a radius: its centre point) over all points in the period.
WITH c AS (SELECT ST_Centroid(:area)::geography AS pt),
d AS (
    SELECT k.*, ST_Distance(k.geom::geography, c.pt) / 1000 AS distance_km
    FROM korea_fire_points k, c WHERE k.acq_date BETWEEN :start AND :end
)
SELECT *, COUNT(*) FILTER (WHERE distance_km <= 1) OVER () AS within_1,
          COUNT(*) FILTER (WHERE distance_km <= 5) OVER () AS within_5,
          COUNT(*) FILTER (WHERE distance_km <= 10) OVER () AS within_10
FROM d ORDER BY distance_km LIMIT 1;
