"""Aggregate FIRMS archive CSVs into the sensor-paired grid table.

    python scripts/aggregate.py \
        --modis "data/raw/archive/modis/**/*.csv" \
        --viirs "data/raw/archive/viirs_snpp/**/*.csv" \
        --res 0.5 --period month [--landcover]

--landcover 를 붙이면 scripts/build_landcover.py 로 만든 토지 피복 표를 격자에 붙여
`landcover`, `landcover_group` 열까지 넣어 저장한다.
"""
from __future__ import annotations

import argparse
import glob
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fsml.aggregate import PERIODS, build_grid  # noqa: E402
from fsml.landcover import attach_landcover, landcover_path  # noqa: E402
from fsml.paths import ROOT, grid_path  # noqa: E402


def expand(patterns: list[str]) -> list[str]:
    files: list[str] = []
    for p in patterns:
        # Relative patterns are resolved against apps/model/, so the command works from anywhere.
        pattern = p if Path(p).is_absolute() else str(ROOT / p)
        files += sorted(glob.glob(pattern, recursive=True))
    return files


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modis", nargs="+", required=True, help="MODIS CSV files or glob patterns")
    ap.add_argument("--viirs", nargs="+", required=True, help="VIIRS CSV files or glob patterns")
    ap.add_argument("--res", type=float, default=0.5, help="grid cell size in degrees (default 0.5)")
    ap.add_argument("--period", choices=PERIODS, default="month")
    ap.add_argument("--all-types", action="store_true",
                    help="keep volcanoes/static sources (default keeps type 0 = vegetation fires only)")
    ap.add_argument("--landcover", nargs="?", type=Path, const=True, default=None,
                    help="attach land cover (default file: data/processed/landcover_<res>.parquet)")
    ap.add_argument("--out", type=Path, help="output parquet (default data/processed/grid_<res>_<period>.parquet)")
    args = ap.parse_args()

    modis, viirs = expand(args.modis), expand(args.viirs)
    print(f"MODIS files: {len(modis)}, VIIRS files: {len(viirs)}")
    out = args.out or grid_path(args.res, args.period)
    t0 = time.time()
    lc = None
    if args.landcover is not None:
        lc = landcover_path(args.res) if args.landcover is True else args.landcover
        if not lc.exists():
            sys.exit(f"land-cover table not found: {lc} (run scripts/build_landcover.py first)")
    df = build_grid(modis, viirs, res=args.res, period=args.period,
                    vegetation_only=not args.all_types, out=None if lc else out)
    if lc:
        df = attach_landcover(df, lc)
        out.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(out, index=False)
    print(f"{len(df):,} cell-periods in {time.time() - t0:.0f}s → {out}")
    ok = df["modis_n"].notna()
    if ok.any() and "modis_n_terra" in df:
        both = df.modis_n_terra.fillna(0) + df.modis_n_aqua.fillna(0)
        print(f"  Terra + Aqua == modis_n: {bool((both[ok] == df.modis_n[ok]).all())}")
    for col in ("modis_n", "modis_n_terra", "modis_n_aqua", "viirs_n"):
        if col in df:
            p = pd.to_datetime(df.loc[df[col].notna(), "period"])
            print(f"  {col}: {p.min():%Y-%m-%d} … {p.max():%Y-%m-%d}")


if __name__ == "__main__":
    main()
