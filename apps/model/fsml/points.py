"""FIRMS detection points in the backend's shared columns (packages/shared-schemas, section 3).

MODIS and VIIRS name their brightness and confidence columns differently; `select_sql` maps both onto
the same 18 columns so they load into one table. Used by scripts/export_backend.py and fsml.korea.
"""
from __future__ import annotations

import zipfile
from collections.abc import Sequence
from pathlib import Path

import duckdb

COLUMNS = ["sensor", "satellite", "latitude", "longitude", "acq_date", "acq_time_utc", "confidence",
           "confidence_level", "frp", "daynight", "bright_fire", "bright_bg", "scan", "track", "version",
           "type", "type_inferred", "data_source"]
# Per sensor: name in the `sensor` column, fire-channel and background-channel brightness columns.
SENSORS = {"modis": ("MODIS", "brightness", "bright_t31"), "viirs": ("VIIRS", "bright_ti4", "bright_ti5")}
# MODIS confidence is a percentage; FIRMS reads it as low < 30 ≤ nominal < 80 ≤ high. VIIRS gives l/n/h.
CONFIDENCE_LEVEL = """CASE
    WHEN confidence IN ('l', 'n', 'h') THEN CASE confidence WHEN 'l' THEN 'low' WHEN 'n' THEN 'nominal' ELSE 'high' END
    WHEN TRY_CAST(confidence AS INTEGER) < 30 THEN 'low'
    WHEN TRY_CAST(confidence AS INTEGER) < 80 THEN 'nominal'
    WHEN TRY_CAST(confidence AS INTEGER) IS NOT NULL THEN 'high' END"""


def _source(files: Sequence[Path | str]) -> str:
    paths = ", ".join("'" + str(f).replace("'", "''") + "'" for f in files)
    return (f"read_csv([{paths}], union_by_name = true, filename = true, "
            "types = {'confidence': 'VARCHAR', 'version': 'VARCHAR'})")


def select_sql(con: duckdb.DuckDBPyConnection, files: Sequence[Path | str], sensor: str, where: str = "TRUE") -> str:
    """SQL for the points in `files` (globs allowed) as COLUMNS. Archive files have no `type_inferred` (0)."""
    name, fire, bg = SENSORS[sensor]
    src = _source(files)
    cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()}
    inferred = "coalesce(CAST(type_inferred AS INTEGER), 0)" if "type_inferred" in cols else "0"
    return f"""
        SELECT '{name}' AS sensor, CAST(satellite AS VARCHAR) AS satellite, latitude, longitude,
               CAST(acq_date AS DATE) AS acq_date, lpad(CAST(acq_time AS VARCHAR), 4, '0') AS acq_time_utc,
               CAST(confidence AS VARCHAR) AS confidence, {CONFIDENCE_LEVEL} AS confidence_level,
               frp, daynight, {fire} AS bright_fire, {bg} AS bright_bg, scan, track, CAST(version AS VARCHAR) AS version,
               CAST(type AS INTEGER) AS type, {inferred} AS type_inferred,
               CASE WHEN filename LIKE '%_NRT_%' THEN 'NRT' ELSE 'SP' END AS data_source
        FROM {src}
        WHERE {where}"""


def zip_csv(con: duckdb.DuckDBPyConnection, query: str, zip_path: Path) -> int:
    """Run `query` into a CSV, pack it alone into `zip_path`, return the row count."""
    csv = zip_path.with_suffix(".csv")
    con.execute(f"COPY ({query}) TO '{csv}' (HEADER)")
    n = con.execute(f"SELECT count(*) FROM read_csv('{csv}', all_varchar = true)").fetchone()[0]
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.write(csv, csv.name)
    csv.unlink()
    return n
