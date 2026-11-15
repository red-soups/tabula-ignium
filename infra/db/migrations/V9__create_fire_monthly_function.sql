CREATE OR REPLACE FUNCTION fire_monthly(
    p_area GEOMETRY,
    p_through DATE
)
RETURNS TABLE (
    period DATE,
    source TEXT,
    harmonized DOUBLE PRECISION,
    low DOUBLE PRECISION,
    high DOUBLE PRECISION,
    harmonized_frp DOUBLE PRECISION,
    frp_low DOUBLE PRECISION,
    frp_high DOUBLE PRECISION,
    modis_n BIGINT,
    viirs_n BIGINT,
    days_observed INT,
    projected DOUBLE PRECISION,
    normal DOUBLE PRECISION,
    percentile DOUBLE PRECISION,
    level TEXT
)
LANGUAGE sql
STABLE
AS $$
WITH pts AS (
    SELECT f.*
    FROM fire_points f
    WHERE f.location && p_area
      AND ST_Intersects(f.location, p_area)
),
months AS (
    SELECT value::DATE AS month_start
    FROM generate_series(
        DATE '2000-11-01',
        CAST(date_trunc('month', p_through) AS DATE),
        INTERVAL '1 month'
    ) value
),
sums AS (
    SELECT
        months.month_start,
        CASE
            WHEN months.month_start < DATE '2002-07-01' THEN 'terra_scaled'
            WHEN months.month_start <= DATE '2024-12-01' THEN 'modis'
            ELSE 'viirs_model'
        END AS calculated_source,
        COALESCE(SUM(points.weight), 0) AS harmonized,
        SUM(points.weight_low) AS low,
        SUM(points.weight_high) AS high,
        SUM(points.frp_weight) AS harmonized_frp,
        SUM(points.frp_weight_low) AS frp_low,
        SUM(points.frp_weight_high) AS frp_high,
        COUNT(points.sensor) FILTER (WHERE points.sensor = 'MODIS') AS modis_n,
        COUNT(points.sensor) FILTER (WHERE points.sensor = 'VIIRS') AS viirs_n
    FROM months
    LEFT JOIN pts points
      ON points.period = to_char(months.month_start, 'YYYY-MM')
    GROUP BY months.month_start
),
monthly AS (
    SELECT
        month_start,
        calculated_source,
        harmonized,
        CASE WHEN calculated_source = 'viirs_model' THEN COALESCE(low, 0) END AS low,
        CASE WHEN calculated_source = 'viirs_model' THEN COALESCE(high, 0) END AS high,
        CASE WHEN calculated_source = 'terra_scaled' THEN NULL ELSE COALESCE(harmonized_frp, 0) END AS harmonized_frp,
        CASE WHEN calculated_source = 'viirs_model' THEN COALESCE(frp_low, 0) END AS frp_low,
        CASE WHEN calculated_source = 'viirs_model' THEN COALESCE(frp_high, 0) END AS frp_high,
        modis_n,
        CASE WHEN month_start >= DATE '2012-01-01' THEN viirs_n END AS viirs_n,
        CASE
            WHEN month_start = CAST(date_trunc('month', p_through) AS DATE)
             AND p_through < (month_start + INTERVAL '1 month - 1 day')::DATE
            THEN EXTRACT(DAY FROM p_through)::INT
        END AS days_observed
    FROM sums
),
ranked AS (
    SELECT
        monthly.*,
        harmonized * EXTRACT(DAY FROM month_start + INTERVAL '1 month - 1 day')
            / days_observed AS projected,
        EXTRACT(MONTH FROM month_start)::INT AS calendar_month
    FROM monthly
),
baseline AS (
    SELECT
        EXTRACT(MONTH FROM month_start)::INT AS calendar_month,
        harmonized,
        round(harmonized::FLOAT8) AS rounded_harmonized
    FROM monthly
    WHERE EXTRACT(YEAR FROM month_start) BETWEEN 2003 AND 2023
),
normals AS (
    SELECT
        calendar_month,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY harmonized) AS normal,
        COUNT(*) AS sample_count
    FROM baseline
    GROUP BY calendar_month
),
percentiles AS (
    SELECT
        ranked.*,
        normals.normal,
        CASE WHEN normals.sample_count >= 5 THEN (
            SELECT 100.0 * (
                COUNT(*) FILTER (WHERE baseline.rounded_harmonized < current_value.value)
                + 0.5 * COUNT(*) FILTER (WHERE baseline.rounded_harmonized = current_value.value)
            ) / COUNT(*)
            FROM baseline
            WHERE baseline.calendar_month = ranked.calendar_month
        ) END AS percentile
    FROM ranked
    CROSS JOIN LATERAL (
        SELECT round(COALESCE(ranked.projected, ranked.harmonized)::FLOAT8) AS value
    ) current_value
    LEFT JOIN normals
      ON normals.calendar_month = ranked.calendar_month
)
SELECT
    month_start,
    calculated_source,
    harmonized,
    low,
    high,
    harmonized_frp,
    frp_low,
    frp_high,
    modis_n,
    viirs_n,
    days_observed,
    projected,
    normal,
    percentile,
    CASE
        WHEN percentile IS NULL THEN NULL
        WHEN percentile < 10 THEN '매우 낮음'
        WHEN percentile < 30 THEN '낮음'
        WHEN percentile < 70 THEN '보통'
        WHEN percentile < 90 THEN '높음'
        ELSE '매우 높음'
    END
FROM percentiles
ORDER BY month_start;
$$;
