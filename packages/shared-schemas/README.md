# Shared data schemas

The contract between the model (`apps/model`), the web app (`apps/web`) and any future API (`apps/api`).
Whoever produces or serves these shapes keeps to them, so each side can change its internals freely.

| Schema | Produced by | Read by |
| --- | --- | --- |
| [Harmonized grid files](#1-harmonized-grid-files) (`manifest.schema.json`) | `apps/model/main.py export-web` | `apps/web/src/data/harmonized.ts` |
| [Calendar row](#2-calendar-row) (`calendar-row.schema.json`) | web (in the browser), later the API | calendar UI, CSV download |

## 1. Harmonized grid files

Written to `apps/web/public/data/harmonized/` (about 4 MB in total). One record per cell × month, every month
from the first to the last, zero where nothing burned.

| File | Layout |
| --- | --- |
| `manifest.json` | Grid, months, source of each month, index settings. See `manifest.schema.json`. |
| `cells.bin` | `Int16` little-endian pairs `row, col`, one per cell, sorted by row then col. |
| `counts.bin.gz` | gzip of `Float32` little-endian, cell-major: value for cell `i`, month `t` is at `i * n_months + t`. |
| `range.bin.gz` | gzip of `Float32` little-endian `[n_cells × n_range_months × 2]` (low, high) for the months in `range_periods`. |

Grid (same convention as the model's 0.5° grid):

```
row = floor((90 - lat) / res)        lat centre = 90 - (row + 0.5) * res
col = floor((lon + 180) / res)       lon centre = -180 + (col + 0.5) * res
```

**Value.** MODIS-equivalent active fire detections. Each month has one `source`:

| source | Months | Meaning | Estimated |
| --- | --- | --- | --- |
| `terra_scaled` | 2000-11 – 2002-06 | Only Terra flew; Terra counts scaled up to Terra + Aqua per 10° block × calendar month | yes |
| `modis` | 2002-07 – 2024-12 | Observed MODIS (Terra + Aqua) | no |
| `viirs_model` | 2025-01 – | VIIRS converted by the AI model (MODIS no longer reliable: Terra orbit drift). VIIRS is Suomi NPP for 2025 and NOAA-20 from 2026 (NPP's feed stopped in 2026-11; notebook 09 validates NOAA-20 input) | yes |

**Range.** For `viirs_model` months each cell carries the model's 80% interval. An area's range is the sum of its
cells' bounds, which is wider than the true interval of the sum; show it as "about", not as a statistical interval.

## 2. Calendar row

One row per month for a selected area. Fields (`calendar-row.schema.json`):

| Field | Type | Meaning |
| --- | --- | --- |
| `period` | `"YYYY-MM"` | Month |
| `count` | number | Harmonized detections in the area |
| `low`, `high` | number \| null | Range, only for `viirs_model` months |
| `normal` | number \| null | Median of the same calendar month over the baseline years (2003–2023) |
| `percentile` | number \| null | 0–100 rank of the month against the same month in the baseline years |
| `level` | 0–5 | 1 Very low (< 10), 2 Low (< 30), 3 Normal (< 70), 4 High (< 90), 5 Very high (≥ 90); 0 = not ranked |
| `anomaly` | boolean | `percentile >= 90` |
| `source` | string | As above |
| `estimated` | boolean | `source` is `terra_scaled` or `viirs_model` |
| `days` | number \| null | Days observed when the month is partial (the latest month), else null |
| `projected` | number \| null | `count × days in month / days` for a partial month, else null |

**How `percentile` is computed** (must match `apps/model/fsml/activity.py`):

1. Sum the cells whose centre lies inside the area, per month.
2. Round each monthly total to a whole number, half to even (`numpy.round`).
3. For the month being ranked, take the rounded totals of the same calendar month in the baseline years.
   Fewer than 5 such years → not ranked.
4. `percentile = 100 × (below + 0.5 × ties) / n_baseline`.

A month listed in the manifest's `partial` (the current month, e.g. `{"2026-11": {"days": 13, "of": 30}}`) is ranked
on `projected` instead of `count`: "at this pace the month would end at …". Show it as such, with the days observed.
With fewer than 7 days observed (`isEarlyEstimate` in harmonized.ts) the projection swings a lot: mark the level
clearly as an estimate.

The CSV download writes these fields in this order, with a header row.

## 3. Backend files (`apps/model/scripts/export_backend.py`)

ZIPs with one CSV each, header row, UTF-8, for the API's database. The two point files have **identical columns in
the same order**, so both load into one table.

**Fire points** — `fire_points_modis_<start>_<end>.zip`, `fire_points_viirs_noaa20_<start>_<end>.zip`, one detection per row:

| Column | Type | Meaning |
| --- | --- | --- |
| `sensor` | text | `MODIS` or `VIIRS` |
| `satellite` | text | `Terra`, `Aqua` (MODIS); `N20` (VIIRS NOAA-20) |
| `latitude`, `longitude` | number | Pixel centre, WGS84 |
| `acq_date` | date | Acquisition date, UTC |
| `acq_time_utc` | text | Acquisition time `HHMM`, UTC |
| `confidence` | text | As FIRMS gives it: MODIS `0`–`100`, VIIRS `l` / `n` / `h` |
| `confidence_level` | text | Both sensors on one scale: `low`, `nominal`, `high` (MODIS: < 30, < 80, ≥ 80) |
| `frp` | number | Fire radiative power, MW |
| `daynight` | text | `D` or `N` |
| `bright_fire` | number | Fire-channel brightness temperature, K (MODIS band 21/22, VIIRS I-4) |
| `bright_bg` | number | Background-channel brightness temperature, K (MODIS band 31, VIIRS I-5) |
| `scan`, `track` | number | Pixel size, km |
| `version` | text | FIRMS processing version (`…NRT` for near real time) |
| `type` | integer | 0 vegetation fire, 1 volcano, 2 other static source (gas flare, industry), 3 offshore |
| `type_inferred` | 0 / 1 | 1: NRT row, `type` inferred from known static-source locations |
| `data_source` | text | `SP` (standard processing) or `NRT` (near real time) |

Show fires with `type = 0`. **Never add MODIS and VIIRS counts together**: both sensors see the same fires, and VIIRS
counts about 4–5 times as many. Show them side by side as raw counts; the harmonized table is what makes them comparable.

**Harmonized monthly table** — `harmonized_monthly_0.5deg.zip`, one 0.5° cell × month per row, only cell-months with
any detection (missing = 0):

| Column | Type | Meaning |
| --- | --- | --- |
| `cell_row`, `cell_col` | integer | 0.5° cell: `floor((90 − lat) / 0.5)`, `floor((lon + 180) / 0.5)` |
| `latitude`, `longitude` | number | Cell centre |
| `period` | text | `YYYY-MM` |
| `modis_n`, `viirs_n` | integer | Raw counts, for reference only (empty when the sensor was not flying) |
| `harmonized` | number | **MODIS-equivalent detections: the value for the calendar** |
| `low`, `high` | number | 80% range, only where `source = viirs_model`; always contains `harmonized` |
| `modis_frp_sum`, `viirs_frp_sum` | number | Raw fire radiative power summed over the cell-month, MW, for reference only |
| `harmonized_frp` | number | **MODIS-equivalent FRP total, MW**: observed MODIS where `source = modis`, model estimate where `viirs_model`, empty for `terra_scaled` |
| `frp_low`, `frp_high` | number | 80% range of `harmonized_frp`, only where `source = viirs_model`; always contains it |
| `source` | text | `terra_scaled`, `modis`, `viirs_model` (section 1) |
| `days_observed` | integer | Days observed in a month still in progress, else empty |

An area's calendar is the sum of `harmonized` over its cells per month, ranked as in section 2. `harmonized_frp` sums
the same way (how strongly the fires burned rather than how many there were); it is in MW, so never add it to a count
or put both on one axis. In a month still in progress both cover only `days_observed` days.

## 4. South Korea files (`python main.py korea`, then `scripts/export_backend.py --korea`)

`exports/backend/korea/`, same CSV-in-ZIP format. They cover the box 33–39°N, 124.5–131°E in whole 0.5° cells, which
also takes in the edge of North Korea and of Japan (Tsushima, northern Kyushu): clip to South Korea's border in the
database. Built by `apps/model/fsml/korea.py`.

**Fire points** — `korea_fire_points.zip`, every vegetation fire (`type = 0`) detected since 2000-11, one per row.
VIIRS is Suomi NPP up to 2025 and NOAA-20 from 2026. The first 18 columns are those of section 3, then:

| Column | Type | Meaning |
| --- | --- | --- |
| `acq_datetime_kst` | text | Acquisition time in Korean time, `YYYY-MM-DD HH:MM` |
| `period` | text | `YYYY-MM` |
| `cell_row`, `cell_col` | integer | 0.5° cell (as section 3) |
| `fine_row`, `fine_col` | integer | 0.1° cell: `floor((90 − lat) / 0.1)`, `floor((lon + 180) / 0.1)` |
| `source` | text | The 0.5° cell-month's `source` (section 1) |
| `carrier` | 0 / 1 | 1: this point carries the MODIS-scale value (MODIS points in `modis` / `terra_scaled` months, VIIRS points in `viirs_model` months) |
| `weight` | number | **MODIS-equivalent detections this point stands for** (0 when `carrier = 0`) |
| `weight_low`, `weight_high` | number | Its share of the 80% range, `viirs_model` months only |
| `frp_weight` | number | MODIS-equivalent FRP, MW: the point's own FRP in `modis` months, its share of `harmonized_frp` in `viirs_model` months, empty for `terra_scaled` |
| `frp_weight_low`, `frp_weight_high` | number | Its share of the FRP range, `viirs_model` months only |

**Any area's monthly value is the sum of `weight` over the points inside it** — a drawn polygon, a radius around a
site, a province. In a 0.5° cell the weights add up exactly to `harmonized` (section 3). In PostGIS:

```sql
SELECT period, SUM(weight) AS harmonized, SUM(weight_low) AS low, SUM(weight_high) AS high,
       SUM(frp_weight) AS harmonized_frp
FROM korea_fire_points
WHERE ST_Within(geom, :area)            -- geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
GROUP BY period ORDER BY period;        -- months with no row are 0
```

- A 0.5° value is split over its points: 2002-07 … 2024-12 this is simply the count of MODIS points; from 2025 the AI
  estimate is split evenly over the cell's VIIRS points (tested in Korea 2013–2024: correlation with actual MODIS at
  0.1° 0.78, against 0.32 for an even split over the area).
- Summing `weight_low` / `weight_high` gives a range that is wider than a true 80% range for the sum (conservative).
- For a list of detections in a document use all rows (both sensors, with `sensor` and `acq_datetime_kst`). For values
  use `weight`; never count rows of both sensors together.

**0.1° monthly table** — `korea_monthly_0.1deg.zip`, the points summed per 0.1° cell × month, only cell-months with a
detection (missing = 0): `fine_row`, `fine_col`, `latitude`, `longitude` (cell centre), `period`, `modis_n`, `viirs_n`
(raw counts; `viirs_n` empty before 2012), `harmonized`, `low`, `high`, `harmonized_frp`, `frp_low`, `frp_high`, `source`,
`days_observed`, meaning as in section 3.

**0.5° monthly table** — `korea_monthly_0.5deg.zip`, the rows of `harmonized_monthly_0.5deg.zip` inside the box, same
columns.

## 5. 산불 이력 확인서 (wildfire history statement) JSON

The user ticks items; the document contains only those. Built by `apps/model/fsml/report.py` from the section 4 points:

```bash
python main.py report --circle 36.35 128.70 10 --start 2025-03-01 --end 2025-04-30 --items A1,B2,B3   # or --bbox, --geojson
python main.py serve --port 8001     # POST /report, GET /items, GET /health on localhost
```

Request (`POST /report`, JSON):

```json
{"area": {"center": [36.35, 128.70], "radius_km": 10},
 "start": "2025-03-01", "end": "2025-04-30", "items": ["A1", "B2", "B3"], "name": "의성군 사업지"}
```

`area` is a GeoJSON `Polygon` / `MultiPolygon` geometry (lon, lat), `{"center": [lat, lon], "radius_km": r}` or
`{"bbox": [south, north, west, east]}`. `items` defaults to all. A full example response:
[`examples/report-uiseong-2025.json`](examples/report-uiseong-2025.json).

Response: `{"meta": {...}, "items": {"<id>": {"title": "...", ...}}}`. `meta` has `document_id` (same request → same
id), `issued_at` (KST), `period`, `data_through` (last observed day), `record_start`, `area` (`kind`, `center`,
`area_km2`, `bbox`) and the `items` asked for. Numbers are rounded; missing values are `null`.

| Item | Title | Content |
| --- | --- | --- |
| A1 | 화재 감지 목록 | `count`, `by_sensor`, `rows[]` (sensor, satellite, `acq_datetime_kst`, lat/lon, confidence_level, frp, daynight, data_source), at most 5,000 (`truncated`) |
| A2 | 감지 지도 | `area` as sent, `bbox`, `points` (GeoJSON FeatureCollection) |
| A3 | 가장 가까운 화재 | From the area's centre: `distance_km`, `nearest` (a row as in A1), `counts_within_km` (1, 5, 10) in the period |
| B1 | 연도별 화재 추이 | `years[]`: `harmonized` (MODIS-scale detections), `low`/`high` (2025–), `complete`, `sources` |
| B2 | 월별 달력 | `months[]` in the period: `harmonized`, `low`, `high`, `normal`, `percentile`, `level`, `days_observed`, `projected`, `source` (as section 2) |
| B3 | 큰 산불 발생 빈도 | Over 2001–2025, months ≥ 3 × their normal and ≥ 5 detections: `years_with_large_fire`, `return_period_years`, `years_with_any_fire`, `largest_months[]` |
| B4 | 고위험 시기 | Normal (2003–2023) mean per calendar month, `share`, `high_risk_months` (≥ 1.5 × an even share), `peak_month` |
| B5 | 최근 추세 | Mean of the last 5 complete years against 2003–2023: `ratio`, `last_year_ratio` |
| B6 | 불 세기(FRP) 이력 | `years[]`: `harmonized_frp` (MW), `mw_per_detection` |
| B7 | 센서 교체 보정 | `years[]`: `raw_modis`, `raw_viirs`, `raw_stitched` (MODIS to 2011, VIIRS from 2012) beside `harmonized`; `raw_viirs_to_modis_ratio` |
| C1 | 불확실성 범위 | 80% range, tested coverage, note |
| C2 | 데이터 출처와 방법 | Data, filter, model, `sources` explained, validation figures |
| C3 | 한계 | `items[]`: limitations to print as they are |
| C4 | 인용 문구 | `text` to cite the statement |

The statement is a reference based on satellite observation, not a legal certificate (C3 says so); call it 확인서,
not 증명서.

### Computing it in the database (the backend's path)

The numbers need only `korea_fire_points` (section 4); the words do not depend on the area.

- [`report.sql`](report.sql): the table (with a PostGIS `geom` column) for a Flyway migration, a function
  `fire_monthly(area, through)` that returns the area's month-by-month record with `normal`, `percentile` and `level`,
  and one query per item. A project's area is the union of its regions' boundaries (query in the file).
- [`report-static.json`](report-static.json): item titles, notes, rules and their numbers, C1–C3 as they are and the C4
  citation template (`{document_id}`, `{issued_date}`, `{data_through}`). Regenerate with `python main.py report-static`.
- Cross-check against [`examples/`](examples): `report-uiseong-2025.json` (10 km, all items),
  `report-gyeongbuk-80km-2025.json` (80 km, B items) and `report-gwangju-40km-2026.json` (40 km, a month still in
  progress). Each was made with `python main.py report` and the command is in its `meta.name`/area.

Checked on PostgreSQL 15 with the circle filter written out (same formula as Python): over all 313 months of four
areas (10–80 km) `percentile` and `level` matched in every month and the values within 0.07, the rounding of
`weight` in the CSV. PostGIS measures distances on the ellipsoid, so a point right on a circle's edge can fall the other
way; A3's centre is `ST_Centroid` of the area (Python: the mean of the polygon's vertices).

## Changing a schema

Bump `format` in the manifest for any change to the file layout, update both the writer
(`apps/model/fsml/webexport.py`) and the reader (`apps/web/src/data/harmonized.ts`), and run
`apps/web/scripts/check_harmonized.ts`, which compares the two on the real files.
