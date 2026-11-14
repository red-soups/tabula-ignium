"""Files for the backend (apps/api) to load into its database, columns as in packages/shared-schemas/README.md.

    python scripts/export_backend.py --start 2026-01-01 --end 2026-11-13
    python scripts/export_backend.py --harmonized-only     only the monthly table (e.g. after main.py frp)
    python scripts/export_backend.py --korea               only South Korea (after main.py korea) → exports/backend/korea/

Writes ZIPs (a CSV inside each; ZIP opens with a double click everywhere) to exports/backend/:

    fire_points_modis_<start>_<end>.zip         raw detections, MODIS
    fire_points_viirs_noaa20_<start>_<end>.zip  raw detections, VIIRS NOAA-20
    harmonized_monthly_0.5deg.zip               AI-harmonized 0.5° cell × month table (whole record)

The two point files have the same columns in the same order, so both load into one table. Points come
from scripts/fetch_firms_api.py (data/raw/api/<sensor>/), the monthly table from exports/harmonized.parquet.

--korea writes the South Korea files instead (fsml.korea; packages/shared-schemas, section 4):

    korea_fire_points.zip       every vegetation-fire point 2000-11 … with its MODIS-scale weight
    korea_monthly_0.1deg.zip    0.1° cell × month
    korea_monthly_0.5deg.zip    the harmonized table's rows inside fsml.korea.BOX
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import duckdb
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fsml import korea  # noqa: E402
from fsml.paths import EXPORTS, RAW  # noqa: E402
from fsml.points import COLUMNS, select_sql, zip_csv  # noqa: E402

# File key: (folder under data/raw/api, sensor in fsml.points.SENSORS)
SENSORS = {"modis": ("modis", "modis"), "viirs_noaa20": ("viirs_noaa20", "viirs")}


def points_query(con: duckdb.DuckDBPyConnection, folder: str, sensor: str, start: date, end: date) -> str:
    where = f"CAST(acq_date AS DATE) BETWEEN DATE '{start}' AND DATE '{end}'"
    return select_sql(con, [RAW / "api" / folder / "**" / "*.csv"], sensor, where) + "\n        ORDER BY acq_date, acq_time_utc"


def harmonized_query(path: Path, where: str = "TRUE") -> str:
    schema = pq.read_schema(path)
    attrs = json.loads((schema.metadata or {}).get(b"PANDAS_ATTRS", b"{}"))
    days = " ".join(f"WHEN strftime(period, '%Y-%m') = '{p}' THEN {d}" for p, (d, _) in attrs.get("partial", {}).items())
    # FRP in MW (main.py frp, notebook 10); fsml.frp already leaves the range empty outside viirs_model rows.
    frp = ("round(modis_frp_sum, 1) AS modis_frp_sum, round(viirs_frp_sum, 1) AS viirs_frp_sum, "
           "round(harmonized_frp, 1) AS harmonized_frp, round(frp_low, 1) AS frp_low, round(frp_high, 1) AS frp_high,"
           if "harmonized_frp" in schema.names else "")
    # low/high describe the AI estimate, so they only belong to rows whose value is that estimate.
    return f"""
        SELECT row AS cell_row, col AS cell_col, lat AS latitude, lon AS longitude, strftime(period, '%Y-%m') AS period,
               modis_n, viirs_n, round(harmonized, 3) AS harmonized,
               CASE WHEN source = 'viirs_model' THEN round(low, 3) END AS low,
               CASE WHEN source = 'viirs_model' THEN round(high, 3) END AS high,
               {frp} source, CASE {days or 'WHEN false THEN NULL'} END AS days_observed
        FROM '{path}'
        WHERE {where}
        ORDER BY period, cell_row, cell_col"""


def korea_queries() -> dict[str, str]:
    pts, fine = EXPORTS / "korea_points.parquet", EXPORTS / "korea_monthly_0.1deg.parquet"
    point_cols = ", ".join("CAST(acq_date AS DATE) AS acq_date" if c == "acq_date" else c for c in COLUMNS)
    s, n, w, e = korea.BOX
    return {
        "korea_fire_points.zip": f"""
            SELECT {point_cols},
                   strftime(acq_date + INTERVAL 9 HOUR + to_minutes(CAST(acq_time_utc[1:2] AS INT) * 60 + CAST(acq_time_utc[3:4] AS INT)),
                            '%Y-%m-%d %H:%M') AS acq_datetime_kst,
                   strftime(period, '%Y-%m') AS period, cell_row, cell_col, fine_row, fine_col, source,
                   CAST(carrier AS INT) AS carrier, round(weight, 4) AS weight, round(weight_low, 4) AS weight_low,
                   round(weight_high, 4) AS weight_high, round(frp_weight, 2) AS frp_weight,
                   round(frp_weight_low, 2) AS frp_weight_low, round(frp_weight_high, 2) AS frp_weight_high
            FROM '{pts}' ORDER BY acq_date, acq_time_utc, sensor""",
        "korea_monthly_0.1deg.zip": f"""
            SELECT fine_row, fine_col, round(latitude, 2) AS latitude, round(longitude, 2) AS longitude,
                   strftime(period, '%Y-%m') AS period, modis_n, CAST(viirs_n AS INT) AS viirs_n,
                   round(harmonized, 3) AS harmonized, round(low, 3) AS low, round(high, 3) AS high,
                   round(harmonized_frp, 1) AS harmonized_frp, round(frp_low, 1) AS frp_low, round(frp_high, 1) AS frp_high,
                   source, CAST(days_observed AS INT) AS days_observed
            FROM '{fine}' ORDER BY period, fine_row, fine_col""",
        "korea_monthly_0.5deg.zip": harmonized_query(EXPORTS / "harmonized.parquet",
                                                     f"lat > {s} AND lat < {n} AND lon > {w} AND lon < {e}"),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", type=date.fromisoformat, help="first day of the point files")
    ap.add_argument("--end", type=date.fromisoformat, help="last day of the point files")
    ap.add_argument("--out", type=Path, default=EXPORTS / "backend")
    ap.add_argument("--harmonized-only", action="store_true", help="skip the (slow) point files")
    ap.add_argument("--korea", action="store_true", help="only the South Korea files (run main.py korea first)")
    args = ap.parse_args()
    if args.korea:
        out = args.out / "korea"
        out.mkdir(parents=True, exist_ok=True)
        con = duckdb.connect()
        for name, query in korea_queries().items():
            n = zip_csv(con, query, out / name)
            print(f"korea/{name}: {n:,} rows, {(out / name).stat().st_size / 1e6:.1f} MB")
        return
    if not args.harmonized_only and not (args.start and args.end):
        ap.error("--start and --end are required for the point files (or pass --harmonized-only)")
    args.out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    for key, (folder, sensor) in ({} if args.harmonized_only else SENSORS).items():
        out = args.out / f"fire_points_{key}_{args.start}_{args.end}.zip"
        n = zip_csv(con, points_query(con, folder, sensor, args.start, args.end), out)
        print(f"{out.name}: {n:,} rows, {out.stat().st_size / 1e6:.0f} MB")
    out = args.out / "harmonized_monthly_0.5deg.zip"
    n = zip_csv(con, harmonized_query(EXPORTS / "harmonized.parquet"), out)
    print(f"{out.name}: {n:,} rows, {out.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
