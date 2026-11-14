"""Prediction intervals with a coverage guarantee (conformalized quantile regression).

Plain quantile models are often over- or under-confident. Here two LightGBM quantile models
give a first band, then a held-out calibration set measures how far the truth falls
outside it and widens (or narrows) the band by exactly that much, so that about
`coverage` of future values land inside on average.
"""
from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from . import gbm


class ConformalInterval:
    def __init__(self, coverage: float = 0.8, seed: int = 0, target: str = "modis_n"):
        self.coverage = coverage
        self.seed = seed
        self.target = target
        self.margin = 0.0

    def fit(self, data: pd.DataFrame, features: list[str], train: np.ndarray, valid: np.ndarray,
            params: dict | None = None) -> "ConformalInterval":
        # Half of the validation rows stop the quantile models early, the other half calibrates,
        # so the calibration rows never influenced the models.
        idx = np.flatnonzero(valid)
        np.random.default_rng(self.seed).shuffle(idx)
        stop = np.zeros(len(data), bool)
        stop[idx[: len(idx) // 2]] = True
        calib = np.zeros(len(data), bool)
        calib[idx[len(idx) // 2:]] = True

        alpha = 1 - self.coverage
        # LightGBM refuses monotone constraints with the quantile loss, so the bands go without them.
        base = {**(params or {}), "monotone": False}
        self.lower = gbm.fit(data, features, train, stop, target=self.target,
                             params={**base, "objective": "quantile", "alpha": alpha / 2}, log_every=0)
        self.upper = gbm.fit(data, features, train, stop, target=self.target,
                             params={**base, "objective": "quantile", "alpha": 1 - alpha / 2}, log_every=0)
        self.features = features

        y = data.loc[calib, self.target].to_numpy(float)
        lo, hi = self._raw(data.loc[calib, features])
        scores = np.maximum(lo - y, y - hi)
        n = len(scores)
        level = min(1.0, np.ceil((n + 1) * self.coverage) / n)
        self.margin = float(np.quantile(scores, level, method="higher"))
        return self

    def _raw(self, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        return self.lower.predict(X), self.upper.predict(X)

    def predict(self, X: pd.DataFrame, calibrated: bool = True) -> tuple[np.ndarray, np.ndarray]:
        lo, hi = self._raw(X[self.features])
        m = self.margin if calibrated else 0.0
        return np.clip(lo - m, 0, None), np.clip(hi + m, 0, None)

    def save(self, folder: Path) -> None:
        folder.mkdir(parents=True, exist_ok=True)
        self.lower.save_model(folder / "lower.txt")
        self.upper.save_model(folder / "upper.txt")
        (folder / "calibration.json").write_text(json.dumps(
            {"coverage": self.coverage, "seed": self.seed, "target": self.target, "margin": self.margin,
             "features": self.features}, indent=1))

    @classmethod
    def load(cls, folder: Path) -> "ConformalInterval":
        c = json.loads((folder / "calibration.json").read_text())
        out = cls(coverage=c["coverage"], seed=c["seed"], target=c.get("target", "modis_n"))
        out.margin, out.features = c["margin"], c["features"]
        out.lower = lgb.Booster(model_file=str(folder / "lower.txt"))
        out.upper = lgb.Booster(model_file=str(folder / "upper.txt"))
        return out


def contain(value, low, high) -> tuple[np.ndarray, np.ndarray]:
    """Bounds put in order and widened just enough to include the point estimate.

    The point comes from the mean model and the bounds from two separately trained quantile models,
    so in about 1% of AI-estimated cells they disagree: where a cell is mostly zero with the odd fire
    the mean can sit above the 90% quantile, and the two quantile models occasionally cross.
    Widening never lowers coverage. Rows without bounds stay without them.
    """
    v, lo, hi = (np.asarray(x, dtype=float) for x in (value, low, high))
    has = ~(np.isnan(lo) | np.isnan(hi))
    a = np.where(has, np.minimum(np.minimum(lo, hi), v), lo)
    b = np.where(has, np.maximum(np.maximum(lo, hi), v), hi)
    return a, b


def coverage(y, low, high) -> dict[str, float]:
    y = np.asarray(y, dtype=float)
    return {
        "포함률": float(((y >= low) & (y <= high)).mean()),
        "평균 폭": float(np.mean(high - low)),
    }
