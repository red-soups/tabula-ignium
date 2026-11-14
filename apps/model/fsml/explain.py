"""What the LightGBM model relies on, per feature and per rule-model module.

Contributions come from LightGBM's built-in SHAP values (`pred_contrib=True`), in the
model's raw (log) scale. Grouping them by the same modules as the rule model makes the
two models comparable: "the AI leans on FRP classes and location the most" etc.
"""
from __future__ import annotations

import lightgbm as lgb
import pandas as pd

MODULES = {
    "VIIRS 탐지 수": ("log_viirs_n",),
    "낮·밤": ("log_viirs_n_day", "log_viirs_n_night", "viirs_day_frac"),
    "FRP 구간 (작은 불 비율)": ("viirs_share_f*",),
    "FRP 세기": ("log_viirs_frp_sum", "log_viirs_frp_mean", "log_viirs_frp_p90"),
    "주변 칸": ("log_nb_*",),
    "위치": ("lat", "lon", "abs_lat"),
    "계절": ("month_sin", "month_cos"),
    "토지 유형": ("landcover", "landcover_group"),
}  # a trailing * matches any feature starting with that prefix


def module_of(feature: str) -> str:
    for module, names in MODULES.items():
        if any(feature.startswith(n[:-1]) if n.endswith("*") else feature == n for n in names):
            return module
    return "기타"


def contributions(model: lgb.Booster, X: pd.DataFrame) -> pd.DataFrame:
    """Per-row SHAP contribution of each feature (the expected-value column is dropped)."""
    values = model.predict(X, pred_contrib=True)
    return pd.DataFrame(values[:, :-1], columns=list(X.columns), index=X.index)


def feature_importance(contrib: pd.DataFrame) -> pd.Series:
    return contrib.abs().mean().sort_values(ascending=False)


def module_importance(contrib: pd.DataFrame) -> pd.Series:
    """Share of the mean |contribution| that each module accounts for (sums to 1)."""
    per_feature = contrib.abs().mean()
    per_module = per_feature.groupby(per_feature.index.map(module_of)).sum()
    return (per_module / per_module.sum()).sort_values(ascending=False)
