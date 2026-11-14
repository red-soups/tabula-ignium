"""MCD12C1(0.05°) → 0.5° 칸별 토지 피복 표.

예:
  .venv/bin/python scripts/build_landcover.py data/raw/landcover/MCD12C1.A2015001.061.<생성일>.hdf
  .venv/bin/python scripts/build_landcover.py data/raw/landcover/mcd12c1_2015_igbp.tif --res 0.5

결과: data/processed/landcover_0.5.parquet (row, col, landcover, landcover_group)

이미 만든 격자 표에 바로 붙이려면 (격자를 다시 집계하지 않고):
  .venv/bin/python scripts/build_landcover.py <입력> --attach-to data/processed/grid_0.5_month.parquet
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

from fsml.landcover import (DEFAULT_LAYER, add_landcover_group, attach_landcover,  # noqa: E402
                            landcover_path, list_layers, majority_to_grid, read_mcd12c1)
from fsml.paths import ROOT  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="MCD12C1 .hdf 또는 AppEEARS GeoTIFF (상대 경로는 apps/model/ 기준)")
    ap.add_argument("--layer", default=DEFAULT_LAYER)
    ap.add_argument("--res", type=float, default=0.5)
    ap.add_argument("--out", default=None, help="기본: data/processed/landcover_{res}.parquet")
    ap.add_argument("--list-layers", action="store_true", help="층 이름만 출력하고 끝냄")
    ap.add_argument("--attach-to", nargs="*", type=Path, default=[],
                    help="landcover 열을 붙여 덮어쓸 격자 parquet (상대 경로는 apps/model/ 기준)")
    args = ap.parse_args()

    if not args.input.is_absolute() and not args.input.exists():
        args.input = ROOT / args.input
    if args.list_layers:
        print("\n".join(list_layers(args.input)))
        return

    t0 = time.time()
    arr = read_mcd12c1(args.input, args.layer)
    lc = add_landcover_group(majority_to_grid(arr, args.res))
    out = Path(args.out) if args.out else landcover_path(args.res)
    out.parent.mkdir(parents=True, exist_ok=True)
    lc.to_parquet(out, index=False)

    land = lc[lc["landcover"] != 0]
    print(f"saved {out}  rows={len(lc):,}  land cells={len(land):,}  ({time.time() - t0:.1f}s)")
    print(land["landcover_group"].value_counts().to_string())

    for grid_file in args.attach_to:
        grid_file = grid_file if grid_file.is_absolute() else ROOT / grid_file
        grid = attach_landcover(pd.read_parquet(grid_file), out)
        grid.to_parquet(grid_file, index=False)
        print(f"attached landcover → {grid_file} ({grid['landcover'].notna().mean():.0%} of rows matched)")


if __name__ == "__main__":
    main()
