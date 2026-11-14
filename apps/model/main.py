"""Tabula Ignium model pipeline entry point.

    python main.py extend data/processed/grid_0.5_month_2026.parquet --through 2026-11-13
                                              new months (NOAA-20) → appended to exports/harmonized.parquet
    python main.py frp                        FRP columns (notebook 10's model) → exports/harmonized.parquet
                                              (extend adds them too once the FRP model exists)
    python main.py korea                      South Korea: weighted points + 0.1° × month → exports/korea_*.parquet
                                              (then scripts/export_backend.py --korea for the backend ZIPs)
    python main.py report --circle 36.35 128.70 10 --start 2025-03-01 --end 2025-04-30 --items A1,B2,B3
                                              산불 이력 확인서 JSON for one area (also --bbox S N W E, --geojson FILE)
    python main.py serve --port 8001          the same over HTTP: POST /report, GET /items (localhost)
    python main.py export-web                 harmonized table → apps/web/public/data/harmonized/
    python main.py export-web --res 2         coarser cells, smaller files
    python main.py calendar -15 -5 -60 -50    calendar of a box (south north west east) from those files

The steps before it are scripts and notebooks (README.md, "실행 순서"):
scripts/aggregate.py builds the 0.5° × month grid, notebook 03 trains the model and writes
exports/harmonized.parquet. The current year comes from scripts/fetch_firms_api.py.
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import date
from pathlib import Path

import lightgbm as lgb
import pandas as pd
import pyarrow.parquet as pq

from fsml import extend, frp, korea, paths, report, webexport

WEB_DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "harmonized"
RES = 0.5
CURRENT_GRID = paths.grid_path(RES, "month", "_2026")


def read_attrs(path: Path) -> dict:
    meta = pq.read_schema(path).metadata or {}
    return json.loads(meta.get(b"PANDAS_ATTRS", b"{}"))


def add_frp(harmonized: pd.DataFrame, current: list[Path]) -> pd.DataFrame:
    """FRP columns from the saved FRP model, following notebook 10's verdicts; unchanged if it was not adopted."""
    if not (frp.FOLDER / "decision.json").exists() or not frp.decision()["adopt"]:
        return harmonized
    verdict = frp.decision()
    archive = pd.read_parquet(paths.grid_path(RES, "month"))
    recent = [pd.read_parquet(g) for g in current]  # VIIRS NOAA-20
    model, interval = frp.load()
    return frp.attach(harmonized, [archive, *recent], [archive, *(recent if verdict["noaa20"] else [])],
                      model, interval, RES, with_range=verdict["range"])


def extend_cmd(args: argparse.Namespace) -> None:
    target = paths.EXPORTS / "harmonized.parquet"
    backup = paths.EXPORTS / "harmonized_archive.parquet"
    if not backup.exists():  # the table notebook 03 wrote, kept as it was
        shutil.copy2(target, backup)
    model = lgb.Booster(model_file=str(paths.MODELS / "lgbm_harmonize.txt"))
    interval = extend.final_interval(pd.read_parquet(paths.grid_path(RES, "month")), RES, paths.MODELS / "interval")
    new = extend.convert(pd.read_parquet(args.grid), model, interval, RES)
    old = pd.read_parquet(backup)
    old.attrs = read_attrs(backup)
    out = add_frp(extend.append(old, new, args.through), [args.grid])
    out.to_parquet(target, index=False)
    added = out[out["period"] >= new["period"].min()]
    print(f"+{len(added):,} rows, {added['period'].min():%Y-%m} … {added['period'].max():%Y-%m} "
          f"(partial: {out.attrs['partial'] or 'none'}, FRP: {'yes' if 'harmonized_frp' in out else 'no'}) → {target}")


def frp_cmd(args: argparse.Namespace) -> None:
    target = paths.EXPORTS / "harmonized.parquet"
    h = pd.read_parquet(target)
    h.attrs = read_attrs(target)
    out = add_frp(h, args.grids)
    if "harmonized_frp" not in out:
        raise SystemExit(f"FRP model not adopted or not trained yet ({frp.FOLDER / 'decision.json'}); see notebook 10")
    out.to_parquet(target, index=False)
    print(f"FRP columns added: {out['harmonized_frp'].notna().sum():,} rows with harmonized_frp, "
          f"{out['frp_low'].notna().sum():,} with a range → {target}")
    print(out.groupby("source", dropna=False)[["harmonized", "harmonized_frp"]].sum().round(0).to_string())


def korea_cmd(args: argparse.Namespace) -> None:
    source = paths.EXPORTS / "harmonized.parquet"
    s, n, w, e = korea.BOX
    h = pd.read_parquet(source, filters=[("lat", ">", s), ("lat", "<", n), ("lon", ">", w), ("lon", "<", e)])
    weighted = korea.weigh(korea.load_points(), h)
    c = korea.check(weighted, h)
    if c["max_abs_gap"] > 1e-6 or c["points_without_cell"]:
        raise SystemExit(f"weights do not add up to the harmonized table: {c}")
    fine = korea.fine_grid(weighted, read_attrs(source).get("partial"))
    weighted.to_parquet(paths.EXPORTS / "korea_points.parquet", index=False)
    fine.to_parquet(paths.EXPORTS / "korea_monthly_0.1deg.parquet", index=False)
    print(f"{len(weighted):,} points ({weighted['carrier'].sum():,} carrying the value), "
          f"{len(fine):,} 0.1° cell-months; weights = harmonized table ({c['harmonized_total']:,.1f}) "
          f"over {c['cell_months']:,} 0.5° cell-months → {paths.EXPORTS}/korea_*.parquet")


def report_inputs() -> tuple[pd.DataFrame, dict]:
    """Weighted Korean points (main.py korea) and the record's partial month / last day."""
    attrs = read_attrs(paths.EXPORTS / "harmonized.parquet")
    weighted = pd.read_parquet(paths.EXPORTS / "korea_points.parquet")
    return weighted, {"partial": attrs.get("partial"), "through": attrs.get("through")}


def read_area(path: Path) -> dict:
    """A GeoJSON geometry, Feature or FeatureCollection (first feature), or a {"center", "radius_km"} / {"bbox"} object."""
    g = json.loads(path.read_text())
    if g.get("type") == "FeatureCollection":
        g = g["features"][0]
    return g.get("geometry", g)


def make_report(weighted: pd.DataFrame, ctx: dict, body: dict) -> dict:
    return report.build(weighted, body["area"], date.fromisoformat(body["start"]), date.fromisoformat(body["end"]),
                        body.get("items"), ctx["partial"], ctx["through"], name=body.get("name"))


def report_cmd(args: argparse.Namespace) -> None:
    area = ({"center": args.circle[:2], "radius_km": args.circle[2]} if args.circle else
            {"bbox": args.bbox} if args.bbox else read_area(args.geojson))
    weighted, ctx = report_inputs()
    body = {"area": area, "start": args.start, "end": args.end, "name": args.name,
            "items": args.items.split(",") if args.items else None}
    text = json.dumps(make_report(weighted, ctx, body), ensure_ascii=False, indent=1 if args.out else None)
    if args.out:
        args.out.write_text(text)
        print(f"{args.out} ({len(text) / 1e3:.0f} kB)")
    else:
        print(text)


def serve_cmd(args: argparse.Namespace) -> None:
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    weighted, ctx = report_inputs()

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, payload) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            if self.path == "/items":
                self._send(200, report.ITEMS)
            elif self.path == "/health":
                self._send(200, {"ok": True, "points": len(weighted), "data_through": ctx["through"]})
            else:
                self._send(404, {"error": "GET /items, GET /health, POST /report"})

        def do_POST(self) -> None:
            if self.path != "/report":
                return self._send(404, {"error": "POST /report"})
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                self._send(200, make_report(weighted, ctx, body))
            except (KeyError, ValueError, TypeError) as e:
                self._send(400, {"error": f"{type(e).__name__}: {e}"})

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"산불 이력 확인서 API: http://{args.host}:{args.port} (POST /report, GET /items, GET /health)")
    server.serve_forever()


def export_web(args: argparse.Namespace) -> None:
    h = pd.read_parquet(args.input, columns=["lat", "lon", "period", "harmonized", "low", "high", "source"])
    h.attrs = read_attrs(args.input)
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
    e = sub.add_parser("extend", help="convert months after the archive and append them to the harmonized table")
    e.add_argument("grid", type=Path, help="0.5° × month grid of the new months (VIIRS = NOAA-20)")
    e.add_argument("--through", type=date.fromisoformat, required=True, help="last day the new data covers")
    e.set_defaults(func=extend_cmd)
    f = sub.add_parser("frp", help="add MODIS-scale FRP columns (notebook 10's model) to the harmonized table")
    f.add_argument("grids", type=Path, nargs="*", default=[CURRENT_GRID],
                   help=f"grids of the months after the archive (default: {CURRENT_GRID.name})")
    f.set_defaults(func=frp_cmd)
    k = sub.add_parser("korea", help="South Korea: weight each detection onto the MODIS scale, build 0.1° × month")
    k.set_defaults(func=korea_cmd)
    r = sub.add_parser("report", help="산불 이력 확인서 JSON for one area (run main.py korea first)")
    where = r.add_mutually_exclusive_group(required=True)
    where.add_argument("--circle", type=float, nargs=3, metavar=("LAT", "LON", "KM"))
    where.add_argument("--bbox", type=float, nargs=4, metavar=("SOUTH", "NORTH", "WEST", "EAST"))
    where.add_argument("--geojson", type=Path, help="polygon as GeoJSON (geometry, Feature or FeatureCollection)")
    r.add_argument("--start", required=True, help="YYYY-MM-DD")
    r.add_argument("--end", required=True, help="YYYY-MM-DD")
    r.add_argument("--items", help=f"comma-separated, default all: {','.join(report.ITEMS)}")
    r.add_argument("--name", help="name printed on the statement")
    r.add_argument("--out", type=Path, help="write to this file instead of stdout")
    r.set_defaults(func=report_cmd)
    rs = sub.add_parser("report-static", help="fixed texts of the statement (titles, rules, C1–C4) for the SQL path")
    rs.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "packages" / "shared-schemas" / "report-static.json")
    rs.set_defaults(func=lambda a: (a.out.write_text(json.dumps(report.static(), ensure_ascii=False, indent=1)), print(a.out)))
    sv = sub.add_parser("serve", help="POST /report over HTTP for the backend (localhost)")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8001)
    sv.set_defaults(func=serve_cmd)
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
