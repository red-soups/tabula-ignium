"""Metrics at cell level and at the aggregated level the fire calendar actually shows."""
from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import font_manager

from . import activity

# Korean axis labels need a Hangul font; use the first one installed.
for _font in ("AppleGothic", "Apple SD Gothic Neo", "NanumGothic", "Malgun Gothic"):
    if any(f.name == _font for f in font_manager.fontManager.ttflist):
        plt.rcParams["font.family"] = _font
        break
plt.rcParams["axes.unicode_minus"] = False


def metrics(true_counts, pred_counts) -> dict[str, float]:
    t = np.asarray(true_counts, dtype=float)
    p = np.asarray(pred_counts, dtype=float)
    lt, lp = np.log1p(t), np.log1p(np.clip(p, 0, None))
    ss_res = np.sum((lt - lp) ** 2)
    ss_tot = np.sum((lt - lt.mean()) ** 2) or 1.0
    return {
        "MAE": float(np.mean(np.abs(t - p))),
        "RMSE": float(np.sqrt(np.mean((t - p) ** 2))),
        "Bias %": float((p.sum() / max(t.sum(), 1) - 1) * 100),
        "R² (log)": float(1 - ss_res / ss_tot),
    }


def compare(true_counts, preds: dict[str, np.ndarray]) -> pd.DataFrame:
    return pd.DataFrame({name: metrics(true_counts, p) for name, p in preds.items()}).T


def aggregate(df: pd.DataFrame, pred_cols: list[str], by: list[str]) -> pd.DataFrame:
    """Sums per group, e.g. by=['period'] for a global calendar or a region column for an AOI."""
    return df.groupby(by)[["modis_n", *pred_cols]].sum()


def plot_pred_vs_true(true_counts, pred_counts, title: str = "", ax=None):
    ax = ax or plt.subplots(figsize=(5, 5))[1]
    t = np.log1p(np.asarray(true_counts, dtype=float))
    p = np.log1p(np.clip(np.asarray(pred_counts, dtype=float), 0, None))
    ax.hexbin(t, p, gridsize=60, bins="log", cmap="inferno", mincnt=1)
    lim = [0, max(t.max(), p.max())]
    ax.plot(lim, lim, color="white", lw=1, ls="--")
    ax.set_xlabel("log1p(MODIS 실제)")
    ax.set_ylabel("log1p(예측)")
    ax.set_title(title)
    return ax


def plot_series(totals: pd.DataFrame, title: str = "", ax=None):
    ax = ax or plt.subplots(figsize=(10, 3.5))[1]
    for col in totals.columns:
        ax.plot(totals.index, totals[col], label=col, lw=1.6 if col == "modis_n" else 1.1)
    ax.set_title(title)
    ax.legend()
    return ax


# ---------------------------------------------------------------- 달력 지표 (화재 시즌 정점 월, 이상 판정)
#
# 공통 규칙
# - df에는 `period`, `modis_n`, `pred_col`, 그리고 `by`의 열이 있어야 한다.
# - 지역 × 월 합계는 fsml.activity.monthly_totals로 낸다. 격자에는 불이 난 칸-월만 행이 있으므로,
#   df 전체의 첫 달~마지막 달 사이에 행이 없는 달은 0으로 채운다. 열마다 값이 있는 첫 달~마지막 달
#   (센서 운영 기간) 밖은 NULL로 두고 비교에서 뺀다. `period`가 일 단위여도 월로 합산한다.
# - 비교할 수 있는 단위가 하나도 없으면 예외 대신 NaN과 n=0을 돌려준다 (7일 샘플에서도 멈추지 않도록).
#
# 예 (정점 3월 vs 4월 → 1개월, 12월 vs 1월 → 1개월). 더 많은 예시는 tests/test_calendar_metrics.py:
#   df = pd.DataFrame({"region": "A", "period": pd.date_range("2015-01-01", periods=12, freq="MS"),
#                      "modis_n": [1, 1, 100, 1, 1, 1, 1, 1, 1, 1, 1, 1],
#                      "pred":    [1, 1, 1, 100, 1, 1, 1, 1, 1, 1, 1, 1]})
#   season_peak_error(df, "pred", ["region"])  # {'mean_abs_months': 1.0, 'within_1_month': 1.0, 'n': 1}

TRUE_COL = "modis_n"
_REGION = "_region"

# 정점 월을 따질 연도로 인정하는 최소 관측 월 수 (0으로 채운 달 포함, NULL 제외).
# 1~2개월만 있는 연도는 정점이 자명하게 일치해서 지표를 부풀리므로 뺀다.
MIN_MONTHS_FOR_PEAK = 6

# z 방식에서 평년값(평균·표준편차)을 만들 최소 연도 수 (지역 × 달마다).
# percentile 방식은 화재 활동 지수와 같은 activity.MIN_BASELINE_YEARS를 쓴다.
MIN_BASELINE_YEARS = 3


def _monthly(df: pd.DataFrame, pred_col: str, by: list[str]) -> pd.DataFrame:
    """지역 × 월 합계 (불 없는 달 0, 센서가 꺼진 달 NULL). 지역 열은 `_region` 하나로 합친다."""
    missing = [c for c in ["period", TRUE_COL, pred_col, *by] if c not in df.columns]
    if missing:
        raise KeyError(f"필요한 열이 없습니다: {missing}")
    if not by:
        raise ValueError("by에 지역 열을 하나 이상 주세요 (예: block_id(df)로 만든 열).")
    cols = list(dict.fromkeys([TRUE_COL, pred_col]))  # pred_col == modis_n 이어도 한 번만
    if len(by) == 1:
        region = df[by[0]]
    else:
        region = pd.Series(pd.MultiIndex.from_frame(df[by].astype("object")).to_flat_index(), index=df.index)
    tmp = df[["period", *cols]].assign(**{_REGION: region.to_numpy()})
    if tmp.empty:
        return pd.DataFrame(columns=[_REGION, "period", *cols, "year", "month"])
    t = activity.monthly_totals(tmp, cols, _REGION)
    period = pd.to_datetime(t["period"])
    return t.assign(year=period.dt.year.to_numpy(), month=period.dt.month.to_numpy())


def _circular_month_diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """월 차이 (12월↔1월은 1개월)."""
    d = np.abs(np.asarray(a, dtype=int) - np.asarray(b, dtype=int)) % 12
    return np.minimum(d, 12 - d)


def season_peak_error(df: pd.DataFrame, pred_col: str, by: list[str],
                      eval_years: tuple[int, int] | None = None) -> dict[str, float]:
    """지역(by) × 연도마다 실제 MODIS(`modis_n`)와 예측(`pred_col`)의 정점 월을 비교.

    반환: {"mean_abs_months": 평균 정점 월 차이 (12월과 1월은 1개월 차이로 계산),
           "within_1_month": 차이가 1개월 이내인 비율, "n": 비교한 지역-연도 수}

    - 실제와 예측이 모두 있는(0 포함, NULL 제외) 달이 MIN_MONTHS_FOR_PEAK 개 이상인 지역-연도만 비교한다.
    - 실제 합계가 0인(불이 없는) 지역-연도는 정점이 정의되지 않으므로 뺀다.
    - 같은 값이 여러 달이면 가장 이른 달을 정점으로 본다.
    - eval_years=(시작, 끝)을 주면 그 연도만 비교한다 (예: 시험 연도).
    """
    nan = {"mean_abs_months": float("nan"), "within_1_month": float("nan"), "n": 0}
    m = _monthly(df, pred_col, by).dropna(subset=[TRUE_COL, pred_col])
    if eval_years is not None:
        m = m[m["year"].between(*eval_years)]
    if m.empty:
        return nan

    unit = [_REGION, "year"]
    g = m.groupby(unit, observed=True)
    stats = g.agg(n_months=("month", "nunique"), true_total=(TRUE_COL, "sum"))
    ok = stats[(stats["n_months"] >= MIN_MONTHS_FOR_PEAK) & (stats["true_total"] > 0)].index
    if len(ok) == 0:
        return nan

    m = m.set_index(unit).loc[ok].reset_index().sort_values([*unit, "month"])
    g = m.groupby(unit, observed=True, sort=False)
    true_peak = m.loc[g[TRUE_COL].idxmax(), [*unit, "month"]].set_index(unit)["month"]
    pred_peak = m.loc[g[pred_col].idxmax(), [*unit, "month"]].set_index(unit)["month"]
    diff = _circular_month_diff(true_peak.to_numpy(), pred_peak.loc[true_peak.index].to_numpy())
    return {
        "mean_abs_months": float(diff.mean()),
        "within_1_month": float((diff <= 1).mean()),
        "n": int(diff.size),
    }


def anomaly_agreement(df: pd.DataFrame, pred_col: str, by: list[str],
                      baseline_years: tuple[int, int] = activity.BASELINE_YEARS, z: float = 1.0,
                      method: str = "percentile",
                      eval_years: tuple[int, int] | None = None) -> dict[str, float]:
    """평년(baseline_years)보다 심한 달을 실제와 예측이 똑같이 잡는지.

    평년값은 지역 × 달(1~12월)마다 baseline_years(양 끝 포함)의 **실제 MODIS**로 만든다.
    예측도 같은 평년값과 비교한다 (실제 서비스에서 앞으로의 환산값을 과거 MODIS 평년과 비교하는 상황과 같다).

    method
      - "percentile" (기본): 달력의 화재 활동 지수와 같은 정의.
        fsml.activity.percentile로 같은 달 평년 대비 백분위를 내고, 백분위 >= activity.ANOMALY(90)이면 이상.
        평년 연도가 activity.MIN_BASELINE_YEARS 개 미만인 지역 × 달은 평가하지 않는다. z는 쓰지 않는다.
      - "zscore": 값 > 평균 + z × 표준편차(표본, ddof=1). 평년 연도가 MIN_BASELINE_YEARS 개 이상일 때만.

    평가 대상은 평년값이 있고 실제·예측이 모두 있는(0 포함) 지역 × 연 × 월이다. eval_years=(시작, 끝)을 주면
    그 연도만 평가한다 (예: 시험 연도). df를 미리 연도로 자르면 평년값이 사라지니 이 인자를 쓴다.
    분모가 0이면 해당 지표는 NaN (예: 실제 이상이 하나도 없으면 recall=NaN).

    반환: {"precision", "recall", "f1", "n_anomalies_true", "n"}
    """
    nan = {"precision": float("nan"), "recall": float("nan"), "f1": float("nan"),
           "n_anomalies_true": 0, "n": 0}
    if method not in ("percentile", "zscore"):
        raise ValueError(f"method는 'percentile' 또는 'zscore': {method!r}")
    m = _monthly(df, pred_col, by)
    if m.empty:
        return nan
    y0, y1 = baseline_years
    in_eval = (m["year"].between(*eval_years) if eval_years is not None
               else pd.Series(True, index=m.index)).to_numpy()

    if method == "percentile":
        true_pct = activity.percentile(m, TRUE_COL, _REGION, years=(y0, y1))
        pred_pct = activity.percentile(m, pred_col, _REGION, base_col=TRUE_COL, years=(y0, y1))
        ok = (true_pct.notna() & pred_pct.notna()).to_numpy() & in_eval
        t = true_pct.to_numpy()[ok] >= activity.ANOMALY
        p = pred_pct.to_numpy()[ok] >= activity.ANOMALY
    else:
        base = m[(m["year"] >= y0) & (m["year"] <= y1)].dropna(subset=[TRUE_COL])
        key = [_REGION, "month"]
        clim = base.groupby(key, observed=True)[TRUE_COL].agg(mu="mean", sd="std", n_years="count")
        clim = clim[clim["n_years"] >= MIN_BASELINE_YEARS]
        ev = m[in_eval].dropna(subset=[TRUE_COL, pred_col]).merge(clim[["mu", "sd"]].reset_index(), on=key, how="inner")
        thr = (ev["mu"] + z * ev["sd"].fillna(0.0)).to_numpy()
        t = ev[TRUE_COL].to_numpy() > thr
        p = ev[pred_col].to_numpy() > thr
    if t.size == 0:
        return nan

    tp = int((t & p).sum())
    fp = int((~t & p).sum())
    fn = int((t & ~p).sum())
    precision = tp / (tp + fp) if (tp + fp) else float("nan")
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    if np.isnan(precision) or np.isnan(recall):
        f1 = float("nan")
    else:
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "n_anomalies_true": int(t.sum()),
        "n": int(t.size),
    }
