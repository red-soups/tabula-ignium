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
| `viirs_model` | 2025-01 – | VIIRS converted by the AI model (MODIS no longer reliable: Terra orbit drift) | yes |

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

**How `percentile` is computed** (must match `apps/model/fsml/activity.py`):

1. Sum the cells whose centre lies inside the area, per month.
2. Round each monthly total to a whole number, half to even (`numpy.round`).
3. For the month being ranked, take the rounded totals of the same calendar month in the baseline years.
   Fewer than 5 such years → not ranked.
4. `percentile = 100 × (below + 0.5 × ties) / n_baseline`.

The CSV download writes these fields in this order, with a header row.

## Changing a schema

Bump `format` in the manifest for any change to the file layout, update both the writer
(`apps/model/fsml/webexport.py`) and the reader (`apps/web/src/data/harmonized.ts`), and run
`apps/web/scripts/check_harmonized.ts`, which compares the two on the real files.
