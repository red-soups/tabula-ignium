"""Build public/fire-timelapse.json for the home map timelapse.

Input: korea_points.parquet from the model (apps/model on branch model-yh: `python main.py korea`).
Each detection carries `weight`, its share of the MODIS-scale (harmonized) count, so summing weights
gives the same scale in every year, before and after VIIRS.

Output: per year, one ember per 0.1° cell with fires, placed at the weighted mean position of the
detections in that cell, plus South Korea yearly totals.

usage: python build_fire_timelapse.py <korea_points.parquet> [out.json]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

THROUGH = "2026-11-13"
YEARS = list(range(2001, 2027))
MIN_VALUE = 0.3
# Rough line just south of the DMZ; cells north of it are North Korea.
DMZ = np.array([(124.5, 37.65), (126.1, 37.75), (126.7, 37.95), (127.1, 38.25), (127.6, 38.33),
                (128.1, 38.3), (128.35, 38.62), (131.0, 38.62)])


def south_korea(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    north_of_dmz = lat >= np.interp(lon, DMZ[:, 0], DMZ[:, 1])
    japan = (lat < 34.8) & (lon > 129.15)          # Tsushima, Kyushu, western Honshu
    return ~north_of_dmz & ~japan


def main(src: str, out: str) -> None:
    p = pd.read_parquet(src, columns=["latitude", "longitude", "acq_date", "fine_row", "fine_col", "weight"])
    p = p[p["weight"] > 0]
    p = p[south_korea(p["latitude"].to_numpy(), p["longitude"].to_numpy())]
    p["year"] = pd.to_datetime(p["acq_date"]).dt.year
    p["wlat"], p["wlon"] = p["latitude"] * p["weight"], p["longitude"] * p["weight"]
    g = p.groupby(["year", "fine_row", "fine_col"], as_index=False)[["wlat", "wlon", "weight"]].sum()
    g["lat"], g["lon"] = g["wlat"] / g["weight"], g["wlon"] / g["weight"]
    g = g[g["weight"] >= MIN_VALUE]
    totals = p.groupby("year")["weight"].sum().reindex(YEARS, fill_value=0).round(0).astype(int).tolist()
    cells = {str(y): [[round(a, 3), round(b, 3), round(v, 1)] for a, b, v in d[["lat", "lon", "weight"]].itertuples(index=False)]
             for y, d in g.groupby("year") if y in YEARS}
    data = {"through": THROUGH, "years": YEARS, "totals": totals, "cells": cells}
    Path(out).write_text(json.dumps(data, separators=(",", ":")))
    print(f"{out}: {sum(len(c) for c in cells.values())} cells, {Path(out).stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).parent.parent / "public" / "fire-timelapse.json"))
