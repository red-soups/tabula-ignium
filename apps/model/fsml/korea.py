"""South Korea at fine resolution: every detection point weighted onto the MODIS (Terra + Aqua) scale.

The model converts 0.5° cell × month totals (fsml.gbm, validated there). Here each 0.5° value is split
over the detection points it was computed from, so any area's MODIS-scale value is the sum of the
weights of the points inside it (a 0.1° cell, a drawn polygon, a radius around a site):

- `modis` months (2002-07 … 2024-12): MODIS points carry the value, 1 each, i.e. exact MODIS counts.
- `terra_scaled` months (… 2002-06): MODIS (Terra) points carry it, each worth the cell's scale factor.
- `viirs_model` months (2025-01 …): VIIRS points carry the AI estimate in equal shares; where a cell-month
  has no VIIRS point, its MODIS points do.

Splitting by VIIRS points beats an even split in Korea 2013–2024 (actual MODIS 0.5° totals split and
compared with actual MODIS at 0.1°: correlation 0.78 vs 0.32, error 0.165 vs 0.231 per cell-month).
The 80% range and FRP are split the same way (FRP by each point's share of the cell's VIIRS FRP).

VIIRS points are Suomi NPP up to 2025 and NOAA-20 from 2026, as in the harmonized table; never both.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import duckdb

from .export import AQUA_START
from .features import MODIS_RELIABLE_UNTIL
from .paths import RAW
from .points import select_sql

# South, north, west, east. Whole 0.5° cells, so every cell's points are all here and the shares add up.
# Includes the edges of North Korea and Japan (Tsushima, northern Kyushu): clip to the border downstream.
BOX = (33.0, 39.0, 124.5, 131.0)
COARSE = 0.5
FINE = 0.1
# Point files per sensor: yearly archive (SP) up to 2025, FIRMS API from 2026 (scripts/fetch_firms_api.py).
FILES = {
    "modis": [RAW / "archive" / "modis" / "**" / "*.csv", RAW / "api" / "modis" / "**" / "*.csv"],
    "viirs": [RAW / "archive" / "viirs_snpp" / "**" / "*.csv", RAW / "api" / "viirs_noaa20" / "**" / "*.csv"],
}
VIIRS_START = pd.Timestamp("2012-01-01")
WEIGHTS = ["weight", "weight_low", "weight_high", "frp_weight", "frp_weight_low", "frp_weight_high"]


def load_points(con: duckdb.DuckDBPyConnection | None = None, box=BOX, files=FILES) -> pd.DataFrame:
    """Vegetation-fire points (type 0, as aggregate.py counts them) inside `box`, shared columns."""
    con = con or duckdb.connect()
    s, n, w, e = box
    where = (f"TRY_CAST(type AS INTEGER) = 0 AND latitude >= {s} AND latitude < {n} "
             f"AND longitude >= {w} AND longitude < {e}")
    parts = [con.execute(select_sql(con, f, sensor, where)).df() for sensor, f in files.items()]
    pts = pd.concat(parts, ignore_index=True)
    pts["acq_date"] = pd.to_datetime(pts["acq_date"])
    return pts.sort_values(["acq_date", "acq_time_utc", "sensor"]).reset_index(drop=True)


def cell_index(lat, lon, res: float) -> tuple[np.ndarray, np.ndarray]:
    """Row (from 90°N) and column (from 180°W) of the `res`-degree cell, as fsml.aggregate numbers them."""
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    row = np.minimum(np.floor((90 - lat) / res), round(180 / res) - 1).astype(int)
    col = np.minimum(np.floor((lon + 180) / res), round(360 / res) - 1).astype(int)
    return row, col


def weigh(points: pd.DataFrame, harmonized: pd.DataFrame) -> pd.DataFrame:
    """`points` with their 0.5° cell, 0.1° cell, the cell's `source`, `carrier` and the WEIGHTS."""
    p = points.copy()
    p["period"] = p["acq_date"].dt.to_period("M").dt.to_timestamp()
    p["cell_row"], p["cell_col"] = cell_index(p["latitude"], p["longitude"], COARSE)
    p["fine_row"], p["fine_col"] = cell_index(p["latitude"], p["longitude"], FINE)
    cols = ["harmonized", "low", "high", "source"] + [c for c in ("harmonized_frp", "frp_low", "frp_high")
                                                     if c in harmonized]
    h = harmonized[["row", "col", "period", *cols]].rename(columns={"row": "cell_row", "col": "cell_col"})
    h = h.assign(period=pd.to_datetime(h["period"]))
    p = p.merge(h, on=["cell_row", "cell_col", "period"], how="left")
    for c in ("harmonized_frp", "frp_low", "frp_high"):
        if c not in p:
            p[c] = np.nan

    key = [p["cell_row"], p["cell_col"], p["period"]]
    modis = (p["sensor"] == "MODIS").to_numpy()
    n_viirs = pd.Series(~modis).groupby(key).transform("sum").to_numpy()
    model = (p["source"] == "viirs_model").to_numpy()
    viirs_carries = model & (n_viirs > 0)
    p["carrier"] = np.where(viirs_carries, ~modis, modis) & p["source"].notna().to_numpy()
    carrier = p["carrier"].to_numpy()
    n = pd.Series(carrier).groupby(key).transform("sum").to_numpy().astype(float)
    share = np.where(carrier, 1 / np.where(n > 0, n, np.nan), 0.0)

    p["weight"] = p["harmonized"].to_numpy(float) * share
    for b in ("low", "high"):
        p[f"weight_{b}"] = np.where(model, p[b].to_numpy(float) * share, np.nan)
    # FRP: observed MODIS FRP point by point in modis months; the estimate split by FRP share otherwise.
    frp = np.where(carrier, np.clip(p["frp"].to_numpy(float), 0, None), 0.0)
    frp_total = pd.Series(frp).groupby(key).transform("sum").to_numpy()
    frp_share = np.where(frp_total > 0, frp / np.where(frp_total > 0, frp_total, 1), share)
    is_modis_month = (p["source"] == "modis").to_numpy()
    p["frp_weight"] = np.where(is_modis_month, np.where(carrier, p["frp"], 0.0),
                               np.where(model, p["harmonized_frp"].to_numpy(float) * frp_share, np.nan))
    for b in ("low", "high"):
        p[f"frp_weight_{b}"] = np.where(model, p[f"frp_{b}"].to_numpy(float) * frp_share, np.nan)
    return p.drop(columns=["harmonized", "low", "high", "harmonized_frp", "frp_low", "frp_high"])


def check(weighted: pd.DataFrame, harmonized: pd.DataFrame) -> dict[str, float]:
    """Weights summed per 0.5° cell-month against the harmonized table: they must give it back."""
    w = weighted.groupby(["cell_row", "cell_col", "period"])[["weight"]].sum()
    h = harmonized.assign(period=pd.to_datetime(harmonized["period"])).rename(columns={"row": "cell_row", "col": "cell_col"})
    s, n, w_, e = BOX
    h = h[(h["lat"] > s) & (h["lat"] < n) & (h["lon"] > w_) & (h["lon"] < e)].set_index(["cell_row", "cell_col", "period"])
    both = h[["harmonized"]].join(w, how="left").fillna({"weight": 0.0})
    lost = both["harmonized"] - both["weight"]
    return {"cell_months": len(both), "harmonized_total": float(both["harmonized"].sum()),
            "weights_total": float(both["weight"].sum()), "max_abs_gap": float(lost.abs().max()),
            "points_without_cell": int(weighted["source"].isna().sum())}


def fine_grid(weighted: pd.DataFrame, partial: dict | None = None) -> pd.DataFrame:
    """0.1° cell × month: raw counts per sensor and the MODIS-scale value with its range and FRP."""
    g = weighted.assign(is_modis=weighted["sensor"] == "MODIS", is_viirs=weighted["sensor"] == "VIIRS")
    out = (g.groupby(["fine_row", "fine_col", "period"])
           .agg(modis_n=("is_modis", "sum"), viirs_n=("is_viirs", "sum"), harmonized=("weight", "sum"),
                low=("weight_low", lambda s: s.sum(min_count=1)), high=("weight_high", lambda s: s.sum(min_count=1)),
                harmonized_frp=("frp_weight", lambda s: s.sum(min_count=1)),
                frp_low=("frp_weight_low", lambda s: s.sum(min_count=1)),
                frp_high=("frp_weight_high", lambda s: s.sum(min_count=1)), source=("source", "first"))
           .reset_index())
    out["viirs_n"] = out["viirs_n"].astype(float).where(out["period"] >= VIIRS_START)
    out["latitude"] = 90 - (out["fine_row"] + 0.5) * FINE
    out["longitude"] = -180 + (out["fine_col"] + 0.5) * FINE
    days = {pd.Timestamp(f"{p}-01"): d for p, (d, _) in (partial or {}).items()}
    out["days_observed"] = out["period"].map(days)
    return out[["fine_row", "fine_col", "latitude", "longitude", "period", "modis_n", "viirs_n", "harmonized",
                "low", "high", "harmonized_frp", "frp_low", "frp_high", "source", "days_observed"]]


# ---------------------------------------------------------------- areas
def inside(points: pd.DataFrame, area: dict) -> np.ndarray:
    """Points inside `area`: a GeoJSON Polygon / MultiPolygon geometry (lon, lat), {"center": [lat, lon],
    "radius_km": r}, or {"bbox": [south, north, west, east]}."""
    lat, lon = points["latitude"].to_numpy(float), points["longitude"].to_numpy(float)
    if "radius_km" in area:
        clat, clon = np.radians(area["center"][0]), np.radians(area["center"][1])
        la, lo = np.radians(lat), np.radians(lon)
        h = np.sin((la - clat) / 2) ** 2 + np.cos(clat) * np.cos(la) * np.sin((lo - clon) / 2) ** 2
        return 2 * 6371.0 * np.arcsin(np.sqrt(h)) <= area["radius_km"]
    if "bbox" in area:
        s, n, w, e = area["bbox"]
        return (lat >= s) & (lat < n) & (lon >= w) & (lon < e)
    from matplotlib.path import Path  # point-in-polygon without a GIS dependency
    polygons = area["coordinates"] if area["type"] == "MultiPolygon" else [area["coordinates"]]
    xy = np.column_stack([lon, lat])
    out = np.zeros(len(points), bool)
    for rings in polygons:
        hit = Path(np.asarray(rings[0], float)).contains_points(xy)
        for hole in rings[1:]:
            hit &= ~Path(np.asarray(hole, float)).contains_points(xy)
        out |= hit
    return out


def area_monthly(weighted: pd.DataFrame, area: dict, partial: dict | None = None) -> pd.DataFrame:
    """Month-by-month MODIS-scale values of `area` over the whole record, with the calendar columns.

    Months without a point are 0. `percentile` / `level` / `normal` rank each month against the same
    month in fsml.activity.BASELINE_YEARS, as the calendar does; a month still in progress (`partial`,
    {"YYYY-MM": [days, of]}) is ranked on its projected total, count × of / days.
    """
    from . import activity

    p = weighted[inside(weighted, area)].assign(is_modis=lambda d: d["sensor"] == "MODIS",
                                                 is_viirs=lambda d: d["sensor"] == "VIIRS")
    cols = ["harmonized", "low", "high", "harmonized_frp", "frp_low", "frp_high", "modis_n", "viirs_n"]
    sums = p.groupby("period").agg(
        harmonized=("weight", "sum"), low=("weight_low", lambda s: s.sum(min_count=1)),
        high=("weight_high", lambda s: s.sum(min_count=1)), harmonized_frp=("frp_weight", lambda s: s.sum(min_count=1)),
        frp_low=("frp_weight_low", lambda s: s.sum(min_count=1)), frp_high=("frp_weight_high", lambda s: s.sum(min_count=1)),
        modis_n=("is_modis", "sum"), viirs_n=("is_viirs", "sum"))
    months = pd.date_range(weighted["period"].min(), weighted["period"].max(), freq="MS")
    t = sums.reindex(months).rename_axis("period").reset_index()
    t["source"] = np.select([t["period"] < pd.Timestamp(AQUA_START), t["period"] <= pd.Timestamp(MODIS_RELIABLE_UNTIL)],
                            ["terra_scaled", "modis"], "viirs_model").astype(object)
    model = (t["source"] == "viirs_model").to_numpy(bool)
    for c in ("harmonized", "modis_n", "viirs_n"):
        t[c] = t[c].fillna(0.0)
    t.loc[t["period"] < VIIRS_START, "viirs_n"] = np.nan
    t.loc[(t["source"] == "terra_scaled").to_numpy(bool), "harmonized_frp"] = np.nan
    t.loc[(t["source"] == "modis").to_numpy(bool), "harmonized_frp"] = t["harmonized_frp"].fillna(0.0)
    for c in ("low", "high", "harmonized_frp", "frp_low", "frp_high"):
        t.loc[model, c] = t.loc[model, c].fillna(0.0)

    days = {pd.Timestamp(f"{k}-01"): v for k, v in (partial or {}).items()}
    d = t["period"].map(lambda x: days.get(x, [np.nan, np.nan]))
    t["days_observed"] = d.str[0].astype(float)
    of = d.str[1].astype(float)
    t["projected"] = t["harmonized"] * of / t["days_observed"]
    t["region"] = 0
    t["ranked"] = t["projected"].fillna(t["harmonized"])
    t["percentile"] = activity.percentile(t, "ranked", "region", base_col="harmonized")
    t["level"] = activity.level(t["percentile"])
    base = t[t["period"].dt.year.between(*activity.BASELINE_YEARS)]
    t["normal"] = t["period"].dt.month.map(base.groupby(base["period"].dt.month)["harmonized"].median())
    return t[["period", *cols, "source", "days_observed", "projected", "normal", "percentile", "level"]]
