"""LightGBM harmonization model: MODIS counts from VIIRS features.

Default, chosen in notebook 06 on the 2012–2025 archive: Tweedie objective with monotone
constraints. Over five test years it matched plain Poisson on calendar totals (153.7 vs 153.0)
while guaranteeing that more VIIRS evidence never lowers the MODIS estimate.
"""
from __future__ import annotations

import lightgbm as lgb
import numpy as np
import pandas as pd

PARAMS = dict(
    objective="tweedie",
    tweedie_variance_power=1.3,
    learning_rate=0.05,
    num_leaves=63,
    min_data_in_leaf=50,
    feature_fraction=0.9,
    bagging_fraction=0.8,
    bagging_freq=1,
    verbose=-1,
)


# More VIIRS evidence in or around a cell must never lower the MODIS estimate.
MONOTONE_UP = (
    "log_viirs_n", "log_viirs_n_day", "log_viirs_n_night", "log_viirs_frp_sum",
    "log_nb_viirs_n", "log_nb_viirs_frp_sum",
)


def monotone(features: list[str]) -> dict:
    return {
        "monotone_constraints": [1 if f in MONOTONE_UP else 0 for f in features],
        "monotone_constraints_method": "advanced",
    }


def variants() -> dict[str, dict]:
    """Parameter sets compared in notebook 06. The first one is the current default."""
    return {
        "LightGBM": {},
        "LightGBM Tweedie (단조 없음)": {"monotone": False},
        "LightGBM Poisson (이전 기본)": {"objective": "poisson", "monotone": False},
        "LightGBM 단조 Poisson": {"objective": "poisson"},
    }


def fit(data: pd.DataFrame, features: list[str], train: np.ndarray, valid: np.ndarray,
        params: dict | None = None, log_every: int = 200, target: str = "modis_n") -> lgb.Booster:
    """`params` overrides PARAMS; pass `monotone=False` to train without the monotone constraints.
    `target` is the MODIS column to learn (fsml.frp learns the FRP total)."""
    params = {**PARAMS, **(params or {})}
    if params.pop("monotone", True):
        params.update(monotone(features))
    y = data[target].astype(float)
    dtrain = lgb.Dataset(data.loc[train, features], y[train])
    dvalid = lgb.Dataset(data.loc[valid, features], y[valid])
    callbacks = [lgb.early_stopping(100, verbose=log_every > 0)]
    if log_every:
        callbacks.append(lgb.log_evaluation(log_every))
    return lgb.train(params, dtrain, num_boost_round=3000,
                     valid_sets=[dvalid], callbacks=callbacks)
