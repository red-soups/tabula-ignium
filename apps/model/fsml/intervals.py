"""Prediction intervals with a coverage guarantee (conformalized quantile regression).

Plain quantile models are often over- or under-confident. Here two LightGBM quantile models
give a first band, then a held-out calibration set measures how far the truth falls
outside it and widens (or narrows) the band by exactly that much, so that about
`coverage` of future values land inside on average.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import gbm


class ConformalInterval:
    def __init__(self, coverage: float = 0.8, seed: int = 0):
        self.coverage = coverage
        self.seed = seed
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
        self.lower = gbm.fit(data, features, train, stop,
                             params={**base, "objective": "quantile", "alpha": alpha / 2}, log_every=0)
        self.upper = gbm.fit(data, features, train, stop,
                             params={**base, "objective": "quantile", "alpha": 1 - alpha / 2}, log_every=0)
        self.features = features

        y = data.loc[calib, "modis_n"].to_numpy(float)
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


def coverage(y, low, high) -> dict[str, float]:
    y = np.asarray(y, dtype=float)
    return {
        "포함률": float(((y >= low) & (y <= high)).mean()),
        "평균 폭": float(np.mean(high - low)),
    }
