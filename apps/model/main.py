"""Tabula Ignium model pipeline entry point.

    python main.py export-web                 harmonized table → apps/web/public/data/harmonized/
    python main.py export-web --res 2         coarser cells, smaller files
    python main.py calendar -15 -5 -60 -50    calendar of a box (south north west east) from those files

The steps before it are scripts and notebooks (README.md, "실행 순서"):
scripts/aggregate.py builds the 0.5° × month grid, notebook 03 trains the model and writes
exports/harmonized.parquet.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from fsml import paths, webexport

WEB_DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "harmonized"


def export_web(args: argparse.Namespace) -> None:
    h = pd.read_parquet(args.input, columns=["lat", "lon", "period", "harmonized", "low", "high", "source"])
    b = webexport.write(h, args.out, args.res)
    m = b["manifest"]
    print(f"{m['n_cells']} cells × {m['periods']['count']} months ({m['periods']['start']}–) at {args.res}° → {args.out}")
    for f in sorted(args.out.iterdir()):
        print(f"  {f.name:15s} {f.stat().st_size / 1e6:6.2f} MB")


def calendar(args: argparse.Namespace) -> None:
    cal = webexport.calendar(webexport.read(args.data), *args.box)
    cal["period"] = cal["period"].dt.strftime("%Y-%m")
    if args.json:
        rows = cal.astype(object).where(cal.notna(), None).to_dict("records")
        print(json.dumps(rows))
    else:
        print(cal.to_csv(index=False), end="")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("export-web", help="write the web app's harmonized data files")
    w.add_argument("--input", type=Path, default=paths.EXPORTS / "harmonized.parquet")
    w.add_argument("--out", type=Path, default=WEB_DATA)
    w.add_argument("--res", type=float, default=webexport.RES)
    w.set_defaults(func=export_web)
    c = sub.add_parser("calendar", help="monthly calendar of a box, computed from the web files")
    c.add_argument("box", type=float, nargs=4, metavar=("SOUTH", "NORTH", "WEST", "EAST"))
    c.add_argument("--data", type=Path, default=WEB_DATA)
    c.add_argument("--json", action="store_true")
    c.set_defaults(func=calendar)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
