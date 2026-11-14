"""Repeated, like-for-like comparison of the harmonization models and a decision rule
fixed before looking at the results.

The primary metric is the calendar-level error: mean absolute error of MODIS totals per
10° block × period, which is closest to what the fire calendar shows. LightGBM is judged
against the *best* rule model, including one that knows the continent, so the rules are
not handicapped by missing regional information.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import evaluate, gbm
from .baseline import RatioBaseline
from .rules import CONTINENT_LEVELS, LANDCOVER_LEVELS, ModularRuleModel
from .splits import block_id

AI = "LightGBM"
PRIMARY = "합계 MAE"


@dataclass(frozen=True)
class Criteria:
    """AI is adopted only if all three hold."""
    min_improvement: float = 0.10  # mean cut in the primary error vs the best rule model
    min_win_share: float = 0.8     # share of folds where AI has the lower primary error
    max_extra_bias: float = 5.0    # percentage points of mean |bias| AI may add over the rules


def default_models(columns=()) -> dict[str, Callable[[], object]]:
    models = {
        "기준선": RatioBaseline,
        "규칙 (위도대·계절)": ModularRuleModel,
        "규칙 (대륙·위도대·계절)": lambda: ModularRuleModel(levels=CONTINENT_LEVELS),
    }
    if "landcover_group" in columns:  # once the land-cover column has been joined onto the grid
        models["규칙 (토지유형·위도대·계절)"] = lambda: ModularRuleModel(levels=LANDCOVER_LEVELS)
    return models


def _scores(test: pd.DataFrame, pred: np.ndarray, block_deg: float, target: str = "modis_n") -> dict[str, float]:
    cell = evaluate.metrics(test[target], pred)
    totals = test.assign(pred=pred).groupby([block_id(test, block_deg), "period"])[[target, "pred"]].sum()
    return {
        PRIMARY: evaluate.metrics(totals[target], totals["pred"])["MAE"],
        "칸 MAE": cell["MAE"],
        "칸 R²(log)": cell["R² (log)"],
        "편향 %": cell["Bias %"],
    }


def cross_validate(data: pd.DataFrame, features: list[str], folds, models=None,
                   ai_variants: dict[str, dict] | None = None, block_deg: float = 10) -> pd.DataFrame:
    """One row per (fold, model). Every model sees the same rows in every fold.

    `ai_variants` maps a name to LightGBM parameter overrides (default: just the default model).
    """
    models = default_models(data.columns) if models is None else models
    ai_variants = ai_variants or {AI: {}}
    rows = []
    for k, (train, valid, test) in enumerate(folds, start=1):
        fit_rows = train | valid  # rule models have no early stopping, so they use both
        t = data[test]
        preds = {name: make().fit(data[fit_rows]).predict(t) for name, make in models.items()}
        for name, params in ai_variants.items():
            model = gbm.fit(data, features, train, valid, params=params, log_every=0)
            preds[name] = model.predict(t[features])
        for name, pred in preds.items():
            rows.append({"fold": k, "모델": name, **_scores(t, pred, block_deg)})
    return pd.DataFrame(rows)


def summarize(results: pd.DataFrame) -> pd.DataFrame:
    stats = results.drop(columns="fold").groupby("모델").agg(["mean", "std"])
    return stats.sort_values((PRIMARY, "mean"))


def decide(results: pd.DataFrame, criteria: Criteria = Criteria(), ai: str = AI) -> tuple[str, dict[str, object]]:
    wide = results.pivot(index="fold", columns="모델", values=PRIMARY)
    rule_names = [m for m in wide.columns if m.startswith("규칙")]
    best = wide[rule_names].mean().idxmin()
    improvement = float((1 - wide[ai] / wide[best]).mean())
    win_share = float((wide[ai] < wide[best]).mean())
    bias = results.assign(abs_bias=results["편향 %"].abs()).groupby("모델")["abs_bias"].mean()
    extra_bias = float(bias[ai] - bias[best])

    checks = {
        f"합계 오차 {criteria.min_improvement:.0%} 이상 개선": improvement >= criteria.min_improvement,
        f"{criteria.min_win_share:.0%} 이상의 fold에서 승리": win_share >= criteria.min_win_share,
        f"편향 증가 {criteria.max_extra_bias:g}%p 이하": extra_bias <= criteria.max_extra_bias,
    }
    adopt = all(checks.values())
    detail = {
        "비교 대상 (최강 규칙 모델)": best,
        "평균 개선율": f"{improvement:+.1%}",
        "승리한 fold": f"{int(round(win_share * len(wide)))} / {len(wide)}",
        "평균 |편향| 차이 (AI − 규칙)": f"{extra_bias:+.1f}%p",
        **{f"기준: {k}": "통과" if v else "미달" for k, v in checks.items()},
    }
    verdict = (f"AI({ai}) 채택: 미리 정한 기준 3개를 모두 통과했습니다." if adopt else
               f"규칙 모델({best}) 채택: 미리 정한 기준 중 "
               f"{sum(not v for v in checks.values())}개를 AI가 넘지 못했습니다.")
    return verdict, detail
