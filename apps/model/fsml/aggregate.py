"""Aggregate FIRMS hotspot CSVs into a sensor-paired grid table.

Each output row is one grid cell in one period with MODIS and VIIRS statistics side by
side. Inside a sensor's operating period a cell with no detections gets 0; outside it
(e.g. VIIRS before 2012) the sensor's columns are NULL, so "no fire" and "no satellite"
never look the same.
"""
from __future__ import annotations

import warnings
from collections.abc import Sequence
from pathlib import Path

import duckdb
import pandas as pd

PERIODS = ("day", "week", "month")
# FRP class edges in MW. VIIRS sees many fires below ~5 MW that MODIS mostly misses.
FRP_EDGES = (2.0, 5.0, 20.0)
DAYNIGHT = ("day", "night")


def class_cols(dn: str) -> list[str]:
    """Per-class count columns for one half of the day, e.g. n_day_f0 … n_day_f3."""
    return [f"n_{dn}_f{k}" for k in range(len(FRP_EDGES) + 1)]


# Count-like columns: 0 inside a sensor's operating period, NULL outside it.
COUNT_COLS = ("n", "frp_sum", *(f"n_{dn}" for dn in DAYNIGHT), *(c for dn in DAYNIGHT for c in class_cols(dn)))

# MODIS only: detections per satellite. Aqua crosses the equator at 13:30 like VIIRS S-NPP,
# Terra at 10:30, so the model side can compare "match Aqua" with "match Terra + Aqua".
# Each column is NULL outside its own satellite's operating period (Aqua starts 2002-07), so
# modis_n == modis_n_terra.fillna(0) + modis_n_aqua.fillna(0) wherever modis_n is not NULL.
# FIRMS writes the satellite as T/A (archive) or Terra/Aqua (some NRT files).
MODIS_SATELLITES = {"terra": ("T", "Terra"), "aqua": ("A", "Aqua")}
MODIS_SAT_COLS = tuple(f"n_{s}" for s in MODIS_SATELLITES)


def _sql_list(paths: Sequence[Path | str]) -> str:
    return "[" + ", ".join("'" + str(p).replace("'", "''") + "'" for p in paths) + "]"


def _class_counts() -> str:
    """SQL for detections per half of the day, in total and per FRP class."""
    edges = (0.0, *FRP_EDGES, float("inf"))
    parts = []
    for dn, test in (("day", "daynight = 'D'"), ("night", "daynight <> 'D'")):
        parts.append(f"count(*) FILTER (WHERE {test}) AS n_{dn}")
        for k, col in enumerate(class_cols(dn)):
            hi = "" if edges[k + 1] == float("inf") else f" AND coalesce(frp, 0) < {edges[k + 1]}"
            parts.append(f"count(*) FILTER (WHERE {test} AND coalesce(frp, 0) >= {edges[k]}{hi}) AS {col}")
    return ",\n            ".join(parts)


def _satellite_counts() -> str:
    """SQL for MODIS detections per satellite (n_terra, n_aqua) plus unrecognised values."""
    sat = "lower(trim(CAST(satellite AS VARCHAR)))"
    parts, known = [], []
    for name, codes in MODIS_SATELLITES.items():
        values = ", ".join(f"'{c.lower()}'" for c in codes)
        known.append(values)
        parts.append(f"count(*) FILTER (WHERE {sat} IN ({values})) AS n_{name}")
    parts.append(f"count(*) FILTER (WHERE {sat} IS NULL OR {sat} NOT IN ({', '.join(known)})) AS n_sat_unknown")
    return ",\n            ".join(parts)


def _sensor_table(con: duckdb.DuckDBPyConnection, name: str, files: Sequence[Path | str],
                  res: float, period: str, vegetation_only: bool) -> tuple[str, ...]:
    """Build the per-cell table for one sensor; returns the extra count columns it added."""
    src = f"read_csv({_sql_list(files)}, union_by_name = true, auto_detect = true)"
    cols = {row[0] for row in con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()}
    # Archive (standard-processing) files carry `type`: 0 = presumed vegetation fire,
    # 1 = volcano, 2 = other static land source, 3 = offshore. NRT files do not.
    where = "WHERE TRY_CAST(type AS INTEGER) = 0" if vegetation_only and "type" in cols else ""
    extra = MODIS_SAT_COLS if name == "modis" and "satellite" in cols else ()
    extra_sql = f",\n            {_satellite_counts()}" if extra else ""
    max_row = round(180 / res) - 1
    max_col = round(360 / res) - 1
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        SELECT
            LEAST(CAST(floor((90 - latitude) / {res}) AS INTEGER), {max_row}) AS row,
            LEAST(CAST(floor((longitude + 180) / {res}) AS INTEGER), {max_col}) AS col,
            CAST(date_trunc('{period}', CAST(acq_date AS DATE)) AS DATE) AS period,
            count(*) AS n,
            sum(frp) AS frp_sum,
            avg(frp) AS frp_mean,
            quantile_cont(frp, 0.9) AS frp_p90,
            avg(CASE WHEN daynight = 'D' THEN 1.0 ELSE 0.0 END) AS day_frac,
            {_class_counts()}{extra_sql}
        FROM {src}
        {where}
        GROUP BY ALL
    """)
    if extra:
        # Counted in the same pass so the (large) archive is read only once.
        n_unknown = con.execute(f"SELECT coalesce(sum(n_sat_unknown), 0) FROM {name}").fetchone()[0]
        if n_unknown:
            warnings.warn(f"{n_unknown:,} MODIS detections have a satellite value other than "
                          f"T/A/Terra/Aqua; they count in modis_n but not in modis_n_terra/aqua",
                          stacklevel=2)
    return extra


def build_grid(modis_files: Sequence[Path | str], viirs_files: Sequence[Path | str], *,
               res: float = 0.5, period: str = "month", vegetation_only: bool = True,
               out: Path | None = None) -> pd.DataFrame:
    if period not in PERIODS:
        raise ValueError(f"period must be one of {PERIODS}")
    if not modis_files or not viirs_files:
        raise ValueError("Need at least one MODIS file and one VIIRS file")

    con = duckdb.connect()
    extra = {
        "modis": _sensor_table(con, "modis", modis_files, res, period, vegetation_only),
        "viirs": _sensor_table(con, "viirs", viirs_files, res, period, vegetation_only),
    }

    def sensor_cols(t: str) -> str:
        cover = f"p.period BETWEEN (SELECT min(period) FROM {t}) AND (SELECT max(period) FROM {t})"
        counts = [f"CASE WHEN {cover} THEN coalesce({t}.{c}, 0) END AS {t}_{c}" for c in COUNT_COLS]
        # Per-satellite columns get the satellite's own operating period (first to last detection),
        # e.g. Aqua only from 2002-07, so a month before launch is NULL rather than 0.
        for c in extra[t]:
            sat_cover = (f"p.period BETWEEN (SELECT min(period) FROM {t} WHERE {c} > 0) "
                         f"AND (SELECT max(period) FROM {t} WHERE {c} > 0)")
            counts.append(f"CASE WHEN {cover} AND {sat_cover} THEN coalesce({t}.{c}, 0) END AS {t}_{c}")
        stats = [f"{t}.{c} AS {t}_{c}" for c in ("frp_mean", "frp_p90", "day_frac")]
        return ",\n            ".join(counts + stats)

    df = con.execute(f"""
        WITH p AS (
            SELECT row, col, period FROM modis
            UNION
            SELECT row, col, period FROM viirs
        )
        SELECT
            p.row, p.col, p.period,
            90 - (p.row + 0.5) * {res} AS lat,
            -180 + (p.col + 0.5) * {res} AS lon,
            {sensor_cols("modis")},
            {sensor_cols("viirs")}
        FROM p
        LEFT JOIN modis USING (row, col, period)
        LEFT JOIN viirs USING (row, col, period)
        ORDER BY p.period, p.row, p.col
    """).df()
    df.attrs.update(res=res, period=period)

    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(out, index=False)
    return df


def overlap(df: pd.DataFrame) -> pd.DataFrame:
    """Rows where both sensors were operating — the only rows usable for training."""
    return df[df["modis_n"].notna() & df["viirs_n"].notna()]
