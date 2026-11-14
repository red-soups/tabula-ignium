"""Hand-off table for the data engineer and the web app."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .features import MODIS_RELIABLE_UNTIL
from .splits import block_id

COLUMNS = ["row", "col", "lat", "lon", "period", "modis_n", "viirs_n",
           "predicted", "low", "high", "harmonized", "source"]

# Aqua joined Terra in 2002-07. Before that "MODIS" is Terra alone, about a third of Terra + Aqua.
AQUA_START = "2002-07-01"
# Years used to scale Terra-only months up to Terra + Aqua: both satellites flying, Terra's orbit
# still maintained (inclination manoeuvres stopped in 2020).
TERRA_STABLE_YEARS = (2003, 2019)
# Terra detections a 10° block × month needs before it gets its own ratio; fewer → latitude band's.
TERRA_MIN = 200

# Where each harmonized value comes from.
SOURCES = {
    "modis": "실제 MODIS (Terra + Aqua)",
    "terra_scaled": "Terra만 있던 시기, 10° 블록 × 월별 (Terra + Aqua) ÷ Terra 비율로 보정",
    "viirs_model": "VIIRS로 환산한 값 (MODIS를 믿을 수 없는 시기)",
}


def _lat_band(lat: pd.Series) -> pd.Series:
    return np.floor(lat / 10).astype(int) * 10


def _ratio(g: pd.DataFrame, keys, min_terra: float = 0) -> pd.Series:
    sums = g.groupby(keys)[["modis_n", "modis_n_terra"]].sum()
    return (sums["modis_n"] / sums["modis_n_terra"].where(sums["modis_n_terra"] > min_terra)).dropna()


def terra_scale(grid: pd.DataFrame) -> pd.Series:
    """(Terra + Aqua) ÷ Terra per 10° block × calendar month over TERRA_STABLE_YEARS.

    Checked on 2003–2019 (ratios from odd years applied to even years): per block × month the
    block totals land within 2.2% of the real Terra + Aqua (median), against 10% per latitude band,
    whose ratio mixes e.g. Amazonia with Africa. `attrs` carry the fallbacks (band, global).
    """
    if "modis_n_terra" not in grid:
        return pd.Series(dtype=float)
    period = pd.to_datetime(grid["period"])
    g = grid[period.dt.year.between(*TERRA_STABLE_YEARS) & grid["modis_n_terra"].notna()]
    month = pd.to_datetime(g["period"]).dt.month
    scale = _ratio(g, [block_id(g, 10), month], TERRA_MIN).rename("scale")
    scale.attrs["band"] = _ratio(g, _lat_band(g["lat"]))
    sums = g[["modis_n", "modis_n_terra"]].sum()
    scale.attrs["overall"] = sums["modis_n"] / sums["modis_n_terra"] if sums["modis_n_terra"] > 0 else np.nan
    return scale


def export_harmonized(df: pd.DataFrame, predicted, low, high, out: Path,
                      scale: pd.Series | None = None) -> pd.DataFrame:
    """One row per cell-period on the MODIS (Terra + Aqua) scale.

    `harmonized` is the observed MODIS count where MODIS is complete and trustworthy
    (AQUA_START … MODIS_RELIABLE_UNTIL), Terra scaled to Terra + Aqua before AQUA_START, and the
    VIIRS-based prediction everywhere else; `source` says which (see SOURCES).
    """
    res = df[["row", "col", "lat", "lon", "period", "modis_n", "viirs_n"]].copy()
    res["predicted"] = np.asarray(predicted, dtype=float)
    res["low"] = np.asarray(low, dtype=float)
    res["high"] = np.asarray(high, dtype=float)

    period = pd.to_datetime(res["period"])
    has_modis = res["modis_n"].notna()
    modis_ok = has_modis & (period >= AQUA_START) & (period <= MODIS_RELIABLE_UNTIL)
    terra_only = has_modis & (period < AQUA_START)
    model_ok = ~modis_ok & ~terra_only & res["predicted"].notna()

    modis = res["modis_n"].astype(float).to_numpy()
    terra = (df["modis_n_terra"] if "modis_n_terra" in df else res["modis_n"]).astype(float).to_numpy()
    scale = scale if scale is not None else pd.Series(dtype=float)
    key = pd.MultiIndex.from_arrays([block_id(res, 10), period.dt.month])
    factor = (pd.Series(key.map(scale) if len(scale) else np.nan, index=res.index, dtype=float)
              .fillna(_lat_band(res["lat"]).map(scale.attrs.get("band", pd.Series(dtype=float))))
              .fillna(scale.attrs.get("overall", np.nan)).to_numpy())
    res["harmonized"] = np.select(
        [modis_ok, terra_only, model_ok],
        [modis, terra * factor, res["predicted"].to_numpy()],
        default=np.nan,
    )
    res["source"] = pd.Series(np.select([modis_ok, terra_only, model_ok],
                                        ["modis", "terra_scaled", "viirs_model"], default=""),
                              index=res.index).replace("", pd.NA).astype("string")
    out.parent.mkdir(parents=True, exist_ok=True)
    res[COLUMNS].to_parquet(out, index=False)
    return res[COLUMNS]
