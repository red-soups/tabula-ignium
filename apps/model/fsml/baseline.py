"""The simple statistical method the model has to beat."""
from __future__ import annotations

import numpy as np
import pandas as pd


class RatioBaseline:
    """MODIS ≈ ratio × VIIRS, with the ratio learned per (latitude band, month of year).

    Groups with too few VIIRS detections fall back to the global ratio.
    """

    def __init__(self, lat_band: float = 10, min_viirs: int = 50):
        self.lat_band = lat_band
        self.min_viirs = min_viirs
        self.global_ratio = 1.0
        self.ratios: dict[tuple[int, int], float] = {}

    def _groups(self, df: pd.DataFrame) -> pd.DataFrame:
        return pd.DataFrame({
            "band": np.floor(df["lat"] / self.lat_band).astype(int),
            "month": pd.to_datetime(df["period"]).dt.month,
        }, index=df.index)

    def fit(self, df: pd.DataFrame) -> "RatioBaseline":
        g = self._groups(df).assign(modis=df["modis_n"], viirs=df["viirs_n"])
        self.global_ratio = g["modis"].sum() / max(g["viirs"].sum(), 1)
        sums = g.groupby(["band", "month"])[["modis", "viirs"]].sum()
        sums = sums[sums["viirs"] >= self.min_viirs]
        self.ratios = (sums["modis"] / sums["viirs"]).to_dict()
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        g = self._groups(df)
        ratio = np.array([self.ratios.get(k, self.global_ratio) for k in zip(g["band"], g["month"])])
        return ratio * df["viirs_n"].to_numpy()
