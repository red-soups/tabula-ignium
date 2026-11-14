"""Fire radiative power (FRP) on the MODIS scale, converted from VIIRS like the counts.

Same features, Tweedie objective and monotone constraints as the count model (fsml.gbm); only the
target changes to `modis_frp_sum`, the MW summed over a cell × month. Notebook 10 tests it against
the FRP ratio baseline with criteria fixed beforehand and saves the final model to models/frp/.

Columns added to the harmonized table (COLUMNS):
- modis_frp_sum, viirs_frp_sum: observed totals, as in the grid table
- harmonized_frp: observed MODIS FRP where `source` is modis, the model estimate where it is
  viirs_model, empty for terra_scaled (the grid keeps per-satellite counts but not per-satellite FRP,
  so Terra-only FRP cannot be scaled to Terra + Aqua)
- frp_low, frp_high: 80% range, viirs_model rows only
"""
from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from . import gbm
from .features import make_features, training_rows
from .intervals import ConformalInterval, contain
from .paths import MODELS

TARGET = "modis_frp_sum"
SOURCE = "viirs_frp_sum"
FOLDER = MODELS / "frp"
COLUMNS = ["modis_frp_sum", "viirs_frp_sum", "harmonized_frp", "frp_low", "frp_high"]
KEYS = ["row", "col", "period"]


def fit_final(grid: pd.DataFrame, res: float, folder: Path = FOLDER) -> tuple[lgb.Booster, ConformalInterval]:
    """Train on every reliable year but the last, stop early and calibrate on the last (as notebook 03), save."""
    data, features = make_features(training_rows(grid), res)
    year = pd.to_datetime(data["period"]).dt.year.to_numpy()
    train, valid = year < year.max(), year == year.max()
    model = gbm.fit(data, features, train, valid, log_every=0, target=TARGET)
    interval = ConformalInterval(coverage=0.8, target=TARGET).fit(data, features, train, valid)
    folder.mkdir(parents=True, exist_ok=True)
    model.save_model(folder / "lgbm_frp.txt")
    interval.save(folder / "interval")
    return model, interval


def load(folder: Path = FOLDER) -> tuple[lgb.Booster, ConformalInterval]:
    return lgb.Booster(model_file=str(folder / "lgbm_frp.txt")), ConformalInterval.load(folder / "interval")


def predict(grid: pd.DataFrame, model: lgb.Booster, interval: ConformalInterval, res: float) -> pd.DataFrame:
    """KEYS + frp_pred, frp_low, frp_high for every row of `grid` with VIIRS."""
    rows = grid[grid["viirs_n"].notna()].reset_index(drop=True)
    full, _ = make_features(rows, res)
    X = full[model.feature_name()]
    pred = model.predict(X)
    low, high = contain(pred, *interval.predict(X))
    return full[KEYS].assign(frp_pred=pred, frp_low=low, frp_high=high)


def _keys(df: pd.DataFrame) -> pd.DataFrame:
    return df.assign(period=pd.to_datetime(df["period"]))


def decision(folder: Path = FOLDER) -> dict[str, bool]:
    """Notebook 10's verdicts: adopt (the model at all), noaa20 (apply to NOAA-20 months), range (publish 80% range)."""
    return json.loads((folder / "decision.json").read_text())


def attach(harmonized: pd.DataFrame, observed: list[pd.DataFrame], converted: list[pd.DataFrame],
           model: lgb.Booster, interval: ConformalInterval, res: float, with_range: bool = True) -> pd.DataFrame:
    """`harmonized` with COLUMNS (replaced if present).

    `observed` grids supply the observed FRP totals and together cover the harmonized months (e.g. the
    archive grid and the current-year grid; where they overlap the later one wins). `converted` are
    the grids whose viirs_model rows get the model estimate; viirs_model rows outside them stay empty.
    """
    obs = pd.concat([_keys(g[KEYS + [TARGET, SOURCE]]) for g in observed]).drop_duplicates(KEYS, keep="last")
    pred = pd.concat([_keys(predict(g, model, interval, res)) for g in converted]).drop_duplicates(KEYS, keep="last")
    out = _keys(harmonized.drop(columns=COLUMNS, errors="ignore"))
    out = out.merge(obs, on=KEYS, how="left").merge(pred, on=KEYS, how="left")
    model_rows = (out["source"] == "viirs_model").to_numpy()
    out["harmonized_frp"] = np.select([(out["source"] == "modis").to_numpy(), model_rows],
                                      [out[TARGET].to_numpy(float), out["frp_pred"].to_numpy(float)], np.nan)
    out.loc[~model_rows | (not with_range), ["frp_low", "frp_high"]] = np.nan
    out = out.drop(columns="frp_pred")
    out.attrs = harmonized.attrs
    return out
