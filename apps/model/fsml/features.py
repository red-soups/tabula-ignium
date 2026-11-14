"""Model inputs derived from the VIIRS side of the grid table.

The default model (notebook 03) learns MODIS counts directly with a count objective (Tweedie, see gbm.py).
`target` / `from_log` are the log1p alternative: similar cell-level fit, but sums come out
too low after transforming back, which matters for the calendar's totals.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from .aggregate import FRP_EDGES, overlap

NEIGHBOR_OFFSETS = [(dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0)]

# Periods where a sensor recorded only part of the time. VIIRS S-NPP starts on 2012-01-20, so the
# 2012-01 row of a monthly grid holds 12 days of VIIRS against a full month of MODIS
# (MODIS/VIIRS 0.64 vs about 0.2 in other months).
PARTIAL_PERIODS = ("2012-01-01",)


def drop_partial_periods(df: pd.DataFrame) -> pd.DataFrame:
    """Leave out PARTIAL_PERIODS before training or evaluating."""
    return df[~pd.to_datetime(df["period"]).isin(pd.to_datetime(PARTIAL_PERIODS))]


# Last month in which MODIS can serve as ground truth. Terra's orbit drift pulled Terra ÷ VIIRS
# down to 0.74 of its 2012–2023 level in 2025 (notebook 07), so later months are neither trained
# on nor tested against; the harmonized record uses the VIIRS-based estimate there instead.
MODIS_RELIABLE_UNTIL = "2024-12-01"


def training_rows(grid: pd.DataFrame) -> pd.DataFrame:
    """Rows the models learn from and are tested on: both sensors operating, whole periods,
    and MODIS still trustworthy."""
    df = drop_partial_periods(overlap(grid))
    reliable = pd.to_datetime(df["period"]) <= pd.Timestamp(MODIS_RELIABLE_UNTIL)
    if not reliable.any():
        # The 7-day NRT sample lies after the cut-off; it only checks that the code runs.
        warnings.warn("모든 행이 MODIS 신뢰 기간 밖입니다 (7일 샘플). 코드 점검용으로 기간 제한 없이 씁니다.",
                      stacklevel=2)
        return df.reset_index(drop=True)
    return df[reliable].reset_index(drop=True)


def add_neighbor_sums(df: pd.DataFrame, res: float, cols=("viirs_n", "viirs_frp_sum")) -> pd.DataFrame:
    """Sum of each column over the 8 surrounding cells in the same period."""
    ncols = round(360 / res)
    keys = ["row", "col", "period"]
    base = df[keys + list(cols)]
    out = df.copy()
    for c in cols:
        out[f"nb_{c}"] = 0.0
    for dr, dc in NEIGHBOR_OFFSETS:
        shifted = base.assign(row=base["row"] - dr, col=(base["col"] - dc) % ncols)
        merged = out[keys].merge(shifted, on=keys, how="left")
        for c in cols:
            out[f"nb_{c}"] += merged[c].fillna(0).to_numpy()
    return out


def make_features(df: pd.DataFrame, res: float) -> tuple[pd.DataFrame, list[str]]:
    nb_cols = ["viirs_n", "viirs_frp_sum"] + (["viirs_n_day", "viirs_n_night"] if "viirs_n_day" in df else [])
    out = add_neighbor_sums(df, res, nb_cols)
    month = pd.to_datetime(out["period"]).dt.month
    out["log_viirs_n"] = np.log1p(out["viirs_n"])
    out["log_viirs_frp_sum"] = np.log1p(out["viirs_frp_sum"])
    out["log_viirs_frp_mean"] = np.log1p(out["viirs_frp_mean"])
    out["log_viirs_frp_p90"] = np.log1p(out["viirs_frp_p90"])
    out["log_nb_viirs_n"] = np.log1p(out["nb_viirs_n"])
    out["log_nb_viirs_frp_sum"] = np.log1p(out["nb_viirs_frp_sum"])
    out["abs_lat"] = out["lat"].abs()
    out["month_sin"] = np.sin(2 * np.pi * month / 12)
    out["month_cos"] = np.cos(2 * np.pi * month / 12)

    features = [
        "log_viirs_n", "log_viirs_frp_sum", "log_viirs_frp_mean", "log_viirs_frp_p90",
        "viirs_day_frac", "log_nb_viirs_n", "log_nb_viirs_frp_sum",
        "lat", "lon", "abs_lat", "month_sin", "month_cos",
    ]
    # Day/night and FRP-class counts (grids built by the current aggregate.py).
    if "viirs_n_day" in out:
        out["log_viirs_n_day"] = np.log1p(out["viirs_n_day"])
        out["log_viirs_n_night"] = np.log1p(out["viirs_n_night"])
        features += ["log_viirs_n_day", "log_viirs_n_night"]
        total = out["viirs_n"].where(out["viirs_n"] > 0)
        for k in range(len(FRP_EDGES) + 1):
            out[f"viirs_share_f{k}"] = (out[f"viirs_n_day_f{k}"] + out[f"viirs_n_night_f{k}"]) / total
            features.append(f"viirs_share_f{k}")
    # Optional land-cover class joined onto the grid (see apps/model/README.md).
    for col in ("landcover", "landcover_group"):
        if col in out:
            out[col] = out[col].astype("category")
            features.append(col)
    # The year is deliberately left out: the model must transfer to years it never saw.
    return out, features


def target(df: pd.DataFrame) -> pd.Series:
    return np.log1p(df["modis_n"])


def from_log(y: np.ndarray | pd.Series) -> np.ndarray:
    return np.expm1(np.clip(np.asarray(y, dtype=float), 0, None))
