"""Modular rule-based harmonization: a readable table of conversion factors.

    MODIS ≈ Σ over day/night [ Σ over FRP class  factor × VIIRS detections
                               + neighbour factor × VIIRS detections in the 8 surrounding cells ]

Module 1  static heat sources are removed upstream (aggregate.py keeps `type` 0 only)
Module 2  day and night are converted separately (VIIRS gains most at night)
Module 3  one factor per FRP class, so small fires MODIS rarely sees get small factors
Module 4  a neighbour term for fires MODIS caught in a cell where VIIRS saw none
          (different overpass times, pixel footprints spilling over cell edges)
Module 5  factors per climate zone and local season (optionally per continent too,
          see CONTINENT_LEVELS)
Module 6  sparse groups shrink toward their parent group (zone → global) instead of
          jumping to a noisy ratio

Factors are non-negative and fitted by Poisson maximum likelihood on the overlap years.
With a single factor this is exactly sum(MODIS) / sum(VIIRS), and in general the fitted
totals match the observed totals, which is what the fire calendar shows. (Least squares
was tried first: it is dominated by the busiest cells and came out ~15% low on totals.)
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .aggregate import DAYNIGHT, FRP_EDGES

ZONE_EDGES = (15, 30, 45, 60)  # |latitude| bands: tropics … boreal
ZONE_LABELS = ("0–15°", "15–30°", "30–45°", "45–60°", "60°+")
SEASON_LABELS = ("겨울", "봄", "여름", "가을")  # northern-hemisphere sense; south is shifted
CONTINENT_LABELS = ("북아메리카", "남아메리카", "유럽", "아프리카·중동", "아시아", "오세아니아")
# Levels that also know the continent, so the rules see regional information as LightGBM does.
CONTINENT_LEVELS = (("continent",), ("continent", "zone"), ("continent", "zone", "season"))
# Levels by land-cover group (forest, savanna, cropland …) once `landcover_group` is on the grid.
LANDCOVER_LEVELS = (("landcover_group",), ("landcover_group", "zone"), ("landcover_group", "zone", "season"))
DN_LABELS = {"day": "낮", "night": "밤", "all": "전체"}
EPS = 1e-9


def continent(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Coarse continent index from lat/lon boxes (see CONTINENT_LABELS)."""
    return np.select(
        [(lon < -30) & (lat >= 15), lon < -30, (lon < 60) & (lat >= 35), lon < 60, lat >= -10],
        [0, 1, 2, 3, 4],
        default=5,
    )


def frp_labels() -> list[str]:
    edges = [f"{e:g}" for e in FRP_EDGES]
    return [f"<{edges[0]}MW", *(f"{a}–{b}MW" for a, b in zip(edges, edges[1:])), f"≥{edges[-1]}MW"]


def _poisson_fit(X: np.ndarray, y: np.ndarray, prior_w: np.ndarray | None = None,
                 prior_s: np.ndarray | None = None) -> np.ndarray:
    """Non-negative w maximising the Poisson likelihood of y ~ X·w.

    The optional prior acts like `prior_s` units of extra evidence per factor that the
    true value is `prior_w` (pseudo-observations), which is how module 6 shrinks groups.
    """
    k = X.shape[1]
    has_prior = prior_w is not None

    def nll(w):
        mu = X @ w + EPS
        f = mu.sum() - y @ np.log(mu)
        g = X.T @ (1 - y / mu)
        if has_prior:
            f += prior_s @ w - (prior_s * prior_w) @ np.log(w + EPS)
            g += prior_s - prior_s * prior_w / (w + EPS)
        return f, g

    col = X.sum(axis=0)
    w0 = np.full(k, y.sum() / max(col.sum(), 1)) if not has_prior else np.maximum(prior_w, 1e-4)
    res = minimize(nll, w0, jac=True, method="L-BFGS-B", bounds=[(0, None)] * k,
                   options={"maxiter": 500})
    w = res.x
    w[col == 0] = prior_w[col == 0] if has_prior else 0.0  # no evidence: keep the parent's
    return w


class ModularRuleModel:
    def __init__(self, use_daynight: bool = True, use_frp: bool = True, use_neighbors: bool = True,
                 levels: Sequence[Sequence[str]] = (("zone",), ("zone", "season")),
                 prior_rows: float = 200.0):
        """`levels` go from coarse to fine and each must extend the previous one.
        `prior_rows`: how many typical rows of evidence a group needs before its own
        factors outweigh its parent's."""
        for coarse, fine in zip(levels, levels[1:]):
            if tuple(fine[:len(coarse)]) != tuple(coarse):
                raise ValueError("each level must extend the previous one")
        self.use_daynight = use_daynight
        self.use_frp = use_frp
        self.use_neighbors = use_neighbors
        self.levels = [tuple(level) for level in levels]
        self.prior_rows = prior_rows
        self.weights: dict[str, dict[tuple, np.ndarray]] = {}

    # ------------------------------------------------------------------ inputs

    @property
    def parts(self) -> tuple[str, ...]:
        return DAYNIGHT if self.use_daynight else ("all",)

    def factor_names(self) -> list[str]:
        names = frp_labels() if self.use_frp else ["탐지"]
        return names + (["이웃 칸"] if self.use_neighbors else [])

    def _design(self, df: pd.DataFrame, part: str) -> tuple[np.ndarray, np.ndarray | None]:
        if "viirs_n_day_f0" not in df:
            raise ValueError("Grid has no day/night FRP-class columns; rebuild it with "
                             "scripts/fetch_sample.py or scripts/aggregate.py")
        halves = DAYNIGHT if part == "all" else (part,)
        classes = np.stack([sum(df[f"viirs_n_{dn}_f{k}"].to_numpy(float) for dn in halves)
                            for k in range(len(FRP_EDGES) + 1)], axis=1)
        X = classes if self.use_frp else classes.sum(axis=1, keepdims=True)
        if self.use_neighbors:
            nb = "nb_viirs_n" if part == "all" else f"nb_viirs_n_{part}"
            if nb not in df:
                raise ValueError(f"Missing {nb}; pass the frame returned by fsml.features.make_features")
            X = np.hstack([X, df[[nb]].to_numpy(float)])
        ycol = "modis_n" if part == "all" else f"modis_n_{part}"
        y = df[ycol].to_numpy(float) if ycol in df else None
        return X, y

    @staticmethod
    def keys(df: pd.DataFrame) -> pd.DataFrame:
        lat = df["lat"].to_numpy()
        month = pd.to_datetime(df["period"]).dt.month.to_numpy()
        # Southern-hemisphere months shift by half a year so seasons line up.
        local = np.where(lat >= 0, month, (month + 5) % 12 + 1)
        keys = pd.DataFrame({
            "zone": np.digitize(np.abs(lat), ZONE_EDGES),
            "season": (local % 12) // 3,  # 0 DJF, 1 MAM, 2 JJA, 3 SON
            "continent": continent(lat, df["lon"].to_numpy()),
        }, index=df.index)
        for col in ("landcover", "landcover_group"):
            if col in df:
                keys[col] = df[col].to_numpy()
        return keys

    # ------------------------------------------------------------------ fitting

    def fit(self, df: pd.DataFrame) -> "ModularRuleModel":
        keys = self.keys(df)
        for part in self.parts:
            X, y = self._design(df, part)
            prior_s = self.prior_rows * X.mean(axis=0)
            table = {(): _poisson_fit(X, y)}
            for depth, cols in enumerate(self.levels):
                parent_len = len(self.levels[depth - 1]) if depth else 0
                groups = keys.groupby(list(cols)).indices
                for key, idx in groups.items():
                    key = key if isinstance(key, tuple) else (key,)
                    table[key] = _poisson_fit(X[idx], y[idx], table[key[:parent_len]], prior_s)
            self.weights[part] = table
        return self

    # ------------------------------------------------------------------ prediction

    def _row_weights(self, keys: pd.DataFrame, part: str) -> np.ndarray:
        table = self.weights[part]
        W = np.tile(table[()], (len(keys), 1))
        for cols in self.levels:
            entries = {k: w for k, w in table.items() if len(k) == len(cols)}
            if not entries:
                continue
            lookup = pd.DataFrame(list(entries.values()), index=pd.MultiIndex.from_tuples(list(entries)))
            found = lookup.reindex(pd.MultiIndex.from_frame(keys[list(cols)]))
            hit = ~found.isna().any(axis=1).to_numpy()
            W[hit] = found.to_numpy()[hit]
        return W

    def predict_parts(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        keys = self.keys(df)
        return {part: (self._design(df, part)[0] * self._row_weights(keys, part)).sum(axis=1)
                for part in self.parts}

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return sum(self.predict_parts(df).values())

    # ------------------------------------------------------------------ explanation

    def table(self, depth: int = 0) -> pd.DataFrame:
        """Conversion factors as a readable table. depth 0 = global, 1 = first level, …"""
        cols = self.levels[depth - 1] if depth else ()
        rows: dict[tuple, dict[str, float]] = {}
        for part, table in self.weights.items():
            for key, w in table.items():
                if len(key) != len(cols):
                    continue
                names = {"zone": ZONE_LABELS, "season": SEASON_LABELS, "continent": CONTINENT_LABELS}
                label = tuple(names[c][v] if c in names else v for c, v in zip(cols, key)) or ("전 세계",)
                for name, value in zip(self.factor_names(), w):
                    rows.setdefault(label, {})[f"{DN_LABELS[part]} {name}"] = value
        out = pd.DataFrame.from_dict(rows, orient="index")
        out.index = pd.MultiIndex.from_tuples(out.index, names=list(cols) or ["그룹"])
        return out.round(3)
