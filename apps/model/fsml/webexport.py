"""Harmonized table → the small files the web app reads (format: packages/shared-schemas/README.md).

The 0.5° hand-off table (export.py, ~5 M rows) is too big for a browser. Here it is summed to
coarser cells and written densely, every cell × every month, so the browser can add up the cells
of any area and build the fire calendar itself:

    manifest.json     grid, months, source of each month, index settings
    cells.bin         Int16 row, col per cell (row counted from the north, as in aggregate.py)
    counts.bin.gz     Float32 harmonized detections, cell-major [n_cells × n_months]
    range.bin.gz      Float32 low, high for the months whose source is viirs_model [n_cells × n_est × 2]

`calendar()` is the reference the web code is checked against (apps/web/scripts/check_harmonized.ts).
"""
from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from . import activity
from .export import SOURCES

RES = 1.0
FORMAT_VERSION = 1
LEVEL_NAMES = ("Very low", "Low", "Normal", "High", "Very high")
ESTIMATED = ("terra_scaled", "viirs_model")
SOURCE_NAMES = {
    "modis": "Observed MODIS (Terra + Aqua)",
    "terra_scaled": "Terra only, scaled up to Terra + Aqua",
    "viirs_model": "VIIRS converted to MODIS-equivalent by the AI model",
}
assert set(SOURCE_NAMES) == set(SOURCES)


def coarsen(h: pd.DataFrame, res: float = RES) -> pd.DataFrame:
    """Sum the 0.5° table to `res`° cells × month (harmonized, low, high)."""
    out = h.assign(row=np.floor((90 - h["lat"]) / res).astype("int16"),
                   col=np.floor((h["lon"] + 180) / res).astype("int16"))
    return (out.groupby(["row", "col", "period"], observed=True)
            .agg(harmonized=("harmonized", "sum"), low=("low", "sum"), high=("high", "sum"),
                 source=("source", "first"))
            .reset_index())


def build(h: pd.DataFrame, res: float = RES) -> dict:
    """Dense arrays and manifest for the web files."""
    periods = pd.date_range(h["period"].min(), h["period"].max(), freq="MS")
    by_period = h.groupby("period")["source"]
    mixed = by_period.nunique()
    if (mixed > 1).any():
        raise ValueError(f"source differs between cells in {list(mixed[mixed > 1].index[:3])}; "
                         "the web format keeps one per month")
    source = by_period.first().reindex(periods).fillna("modis").astype(str).tolist()

    c = coarsen(h, res)
    cells = c[["row", "col"]].drop_duplicates().sort_values(["row", "col"]).reset_index(drop=True)
    ci = pd.MultiIndex.from_frame(cells).get_indexer(pd.MultiIndex.from_frame(c[["row", "col"]]))
    ti = periods.get_indexer(c["period"])
    counts = np.zeros((len(cells), len(periods)), np.float32)
    counts[ci, ti] = c["harmonized"].to_numpy(np.float32)

    est = [t for t, s in enumerate(source) if s == "viirs_model"]
    rng = np.zeros((len(cells), len(est), 2), np.float32)
    if est:
        pos = {t: k for k, t in enumerate(est)}
        m = np.isin(ti, est)
        k = np.array([pos[t] for t in ti[m]])
        rng[ci[m], k, 0] = c.loc[m, "low"].fillna(c.loc[m, "harmonized"]).to_numpy(np.float32)
        rng[ci[m], k, 1] = c.loc[m, "high"].fillna(c.loc[m, "harmonized"]).to_numpy(np.float32)

    manifest = {
        "format": FORMAT_VERSION,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "unit": "MODIS-equivalent active fire detections per cell per month",
        "grid": {"res": res, "row": "floor((90 - lat) / res)", "col": "floor((lon + 180) / res)",
                 "cell_center": "lat = 90 - (row + 0.5) * res, lon = -180 + (col + 0.5) * res"},
        "periods": {"start": periods[0].strftime("%Y-%m"), "count": len(periods)},
        "n_cells": len(cells),
        "source": source,
        "sources": SOURCE_NAMES,
        "estimated_sources": list(ESTIMATED),
        "range_periods": [periods[t].strftime("%Y-%m") for t in est],
        "range_note": "80% interval per cell; the area range is the sum of cell bounds, so it is wider than the true interval",
        "index": {
            "baseline_years": list(activity.BASELINE_YEARS),
            "min_baseline_years": activity.MIN_BASELINE_YEARS,
            "level_edges": list(activity.LEVEL_EDGES),
            "level_names": list(LEVEL_NAMES),
            "anomaly_percentile": activity.ANOMALY,
            "rounding": "area totals are rounded half to even before ranking",
        },
        "files": {"cells": "cells.bin", "counts": "counts.bin.gz", "range": "range.bin.gz"},
        "credit": "NASA FIRMS MODIS C6.1 and VIIRS S-NPP 375 m archives, harmonized by Tabula Ignium (Red Soups)",
    }
    return {"manifest": manifest, "cells": cells, "counts": counts, "range": rng, "periods": periods}


def write(h: pd.DataFrame, out: Path, res: float = RES) -> dict:
    b = build(h, res)
    out.mkdir(parents=True, exist_ok=True)
    (out / "manifest.json").write_text(json.dumps(b["manifest"], indent=1))
    (out / "cells.bin").write_bytes(b["cells"][["row", "col"]].to_numpy("<i2").tobytes())
    for name, arr in (("counts.bin.gz", b["counts"]), ("range.bin.gz", b["range"])):
        (out / name).write_bytes(gzip.compress(arr.astype("<f4").tobytes(), 9, mtime=0))
    return b


def read(out: Path) -> dict:
    """Read the files back (tests and the reference calendar use this, not the parquet)."""
    m = json.loads((out / "manifest.json").read_text())
    rc = np.frombuffer((out / "cells.bin").read_bytes(), "<i2").reshape(-1, 2)
    n_t = m["periods"]["count"]
    counts = np.frombuffer(gzip.decompress((out / "counts.bin.gz").read_bytes()), "<f4").reshape(-1, n_t)
    rng = np.frombuffer(gzip.decompress((out / "range.bin.gz").read_bytes()), "<f4")
    rng = rng.reshape(len(rc), len(m["range_periods"]), 2)
    periods = pd.date_range(m["periods"]["start"] + "-01", periods=n_t, freq="MS")
    return {"manifest": m, "rows": rc[:, 0], "cols": rc[:, 1], "counts": counts, "range": rng, "periods": periods}


def cells_in(w: dict, south: float, north: float, west: float, east: float) -> np.ndarray:
    """Cells whose centre lies inside the box. west > east crosses the antimeridian."""
    res = w["manifest"]["grid"]["res"]
    lat = 90 - (w["rows"] + 0.5) * res
    lon = -180 + (w["cols"] + 0.5) * res
    in_lon = (lon >= west) & (lon <= east) if west <= east else (lon >= west) | (lon <= east)
    return np.flatnonzero((lat >= south) & (lat <= north) & in_lon)


def calendar(w: dict, south: float, north: float, west: float, east: float) -> pd.DataFrame:
    """Monthly calendar for a box, from the web files, using activity.py for the index."""
    idx = cells_in(w, south, north, west, east)
    m = w["manifest"]
    t = pd.DataFrame({"area": "aoi", "period": w["periods"], "count": w["counts"][idx].sum(0, dtype=np.float64)})
    t = activity.activity_index(t, "count", "area")
    t["level"] = t["level"].cat.codes + 1  # 1–5, 0 = not ranked
    t["source"] = m["source"]
    t["estimated"] = t["source"].isin(m["estimated_sources"])
    lo = np.full(len(t), np.nan)
    hi = np.full(len(t), np.nan)
    pos = t["period"].dt.strftime("%Y-%m").map({p: k for k, p in enumerate(m["range_periods"])})
    has = pos.notna().to_numpy()
    if has.any():
        r = w["range"][idx][:, pos[has].astype(int).to_numpy()].sum(0, dtype=np.float64)
        lo[has], hi[has] = r[:, 0], r[:, 1]
    t["low"], t["high"] = lo, hi
    t["anomaly"] = t["percentile"] >= m["index"]["anomaly_percentile"]
    return t[["period", "count", "low", "high", "normal", "percentile", "level", "anomaly", "source", "estimated"]]
