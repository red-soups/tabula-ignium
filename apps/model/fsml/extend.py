"""Months after the last archive year, appended to the harmonized table.

The yearly FIRMS archive ends with the last full year, so the current year is aggregated from the
API (scripts/fetch_firms_api.py, then scripts/aggregate.py --static-mask) and converted here with
the saved final model (notebook 03), exactly like the 2025 `viirs_model` months. VIIRS is NOAA-20:
Suomi NPP's feed stopped in 2026-11, and notebook 09 shows the NPP-trained model works on NOAA-20.

The 80% range uses the same conformal interval as notebook 03, refitted once on the same split
(train up to the year before the last reliable MODIS year, stop and calibrate on that year) and
saved to models/interval/ so later months reuse it.
"""
from __future__ import annotations

import calendar
from datetime import date
from pathlib import Path

import lightgbm as lgb
import pandas as pd

from .export import COLUMNS
from .features import make_features, training_rows
from .intervals import ConformalInterval, contain


def final_interval(grid: pd.DataFrame, res: float, folder: Path) -> ConformalInterval:
    """Load the saved interval models, or fit them as notebook 03 does and save them."""
    if (folder / "calibration.json").exists():
        return ConformalInterval.load(folder)
    data, features = make_features(training_rows(grid), res)
    year = pd.to_datetime(data["period"]).dt.year.to_numpy()
    interval = ConformalInterval(coverage=0.8).fit(data, features, year < year.max(), year == year.max())
    interval.save(folder)
    return interval


def convert(grid_new: pd.DataFrame, model: lgb.Booster, interval: ConformalInterval, res: float) -> pd.DataFrame:
    """Hand-off rows (export.COLUMNS) for a grid of new months: every row with VIIRS becomes viirs_model."""
    rows = grid_new[grid_new["viirs_n"].notna()].reset_index(drop=True)
    full, _ = make_features(rows, res)
    X = full[model.feature_name()]
    pred = model.predict(X)
    low, high = contain(pred, *interval.predict(X))
    out = full.assign(predicted=pred, low=low, high=high, harmonized=pred, source="viirs_model")
    out["period"] = pd.to_datetime(out["period"])
    return out[COLUMNS]


def partial_months(through: date) -> dict[str, list[int]]:
    """{"YYYY-MM": [days observed, days in month]} for the last month when it is not complete."""
    n = calendar.monthrange(through.year, through.month)[1]
    return {} if through.day == n else {f"{through:%Y-%m}": [through.day, n]}


def append(harmonized: pd.DataFrame, new: pd.DataFrame, through: date) -> pd.DataFrame:
    """Replace any months of `new` already in `harmonized`, keep months in order, record a partial last month."""
    start = new["period"].min()
    keep = harmonized[pd.to_datetime(harmonized["period"]) < start]
    out = pd.concat([keep, new[new["period"] <= pd.Timestamp(through)]], ignore_index=True)
    out["source"] = out["source"].astype("string")
    # Archive months exported before intervals.contain existed get the same treatment.
    m = (out["source"] == "viirs_model").to_numpy()
    out.loc[m, "low"], out.loc[m, "high"] = contain(out.loc[m, "harmonized"], out.loc[m, "low"], out.loc[m, "high"])
    out.attrs = {**harmonized.attrs, "partial": partial_months(through), "through": through.isoformat()}
    return out

