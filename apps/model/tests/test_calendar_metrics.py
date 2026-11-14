"""작은 가짜 데이터로 달력 지표를 확인한다.  실행: .venv/bin/python -m pytest tests -q"""
import math

import numpy as np
import pandas as pd
import pytest

from fsml import activity
from fsml.evaluate import _monthly, anomaly_agreement, season_peak_error


def _year(region, year, values, pred=None):
    pred = values if pred is None else pred
    return pd.DataFrame({
        "region": region,
        "period": pd.date_range(f"{year}-01-01", periods=12, freq="MS"),
        "modis_n": values, "pred": pred,
    })


def _peak(month):
    v = np.ones(12); v[month - 1] = 100
    return v


def _rows(region, items):
    """(YYYY-MM, modis_n, pred) 목록 → 격자처럼 불이 난 달만 행이 있는 표."""
    return pd.DataFrame([{"region": region, "period": pd.Timestamp(p + "-01"), "modis_n": t, "pred": q}
                         for p, t, q in items])


# ------------------------------------------------------------------ season_peak_error
def test_peak_one_month_apart():  # 정점 3월 vs 4월 → 1개월
    df = _year("A", 2015, _peak(3), _peak(4))
    r = season_peak_error(df, "pred", ["region"])
    assert r == {"mean_abs_months": 1.0, "within_1_month": 1.0, "n": 1}


def test_peak_wraps_december_january():  # 12월 vs 1월 → 1개월, 11월 vs 2월 → 3개월
    df = pd.concat([_year("A", 2015, _peak(12), _peak(1)),
                    _year("B", 2015, _peak(11), _peak(2))])
    r = season_peak_error(df, "pred", ["region"])
    assert r["n"] == 2 and r["mean_abs_months"] == 2.0 and r["within_1_month"] == 0.5


def test_peak_daily_input_is_summed_to_months():
    days = pd.date_range("2015-01-01", "2015-12-31", freq="D")
    true = np.where(days.month == 8, 10, 1)
    pred = np.where(days.month == 9, 10, 1)
    df = pd.DataFrame({"region": "A", "period": days, "modis_n": true, "pred": pred})
    assert season_peak_error(df, "pred", ["region"])["mean_abs_months"] == 1.0


def test_peak_fire_free_months_are_zero_not_missing():
    # 리뷰 사례 1: 6~9월에만 불나는 지역, 8년치. 격자에는 6~9월 행만 있다.
    # 빈 달을 0으로 채우지 않으면 해마다 4개월뿐이라 6개월 기준에 걸려 n=0이 된다.
    items = []
    for y in range(2010, 2018):
        for m, t, q in ((6, 5, 5), (7, 20, 20), (8, 50, 30), (9, 10, 40)):
            items.append((f"{y}-{m:02d}", t, q))
    r = season_peak_error(_rows("A", items), "pred", ["region"])
    assert r["n"] == 8                               # 8개 연도 모두 비교
    assert r["mean_abs_months"] == 1.0               # 정점 8월 vs 9월


def test_peak_skips_no_fire_and_short_records():
    no_fire = _year("A", 2015, np.zeros(12))
    r = season_peak_error(no_fire, "pred", ["region"])
    assert r["n"] == 0 and math.isnan(r["mean_abs_months"])
    # 7일 샘플처럼 전체 기간이 1개월뿐이면 비교할 연도가 없다
    days = pd.date_range("2026-10-21", periods=7, freq="D")
    week = pd.DataFrame({"region": "A", "period": days, "modis_n": 3, "pred": 2})
    assert season_peak_error(week, "pred", ["region"])["n"] == 0
    assert anomaly_agreement(week, "pred", ["region"], (2003, 2023))["n"] == 0


def test_peak_ignores_null_months():  # 운영 기간 밖(NULL)은 0으로 채우지 않음
    v = _peak(5).astype(float); v[:3] = np.nan
    m = _monthly(_year("A", 2015, v), "pred", ["region"])
    assert m["modis_n"].isna().sum() == 3
    r = season_peak_error(_year("A", 2015, v), "pred", ["region"])
    assert r["n"] == 1 and r["mean_abs_months"] == 0.0


def test_peak_eval_years_and_multi_column_by():
    df = pd.concat([_year("A", 2015, _peak(3), _peak(3)), _year("A", 2016, _peak(3), _peak(6))])
    df["band"] = 1
    assert season_peak_error(df, "pred", ["region", "band"])["n"] == 2
    r = season_peak_error(df, "pred", ["region", "band"], eval_years=(2016, 2016))
    assert r["n"] == 1 and r["mean_abs_months"] == 3.0


# ------------------------------------------------------------------ anomaly_agreement (zscore)
def _clim(years, region="A"):
    # 평년: 매달 9, 10, 11 이 해마다 번갈아 → 평균 10
    return pd.concat([_year(region, y, np.full(12, 9 + (i % 3))) for i, y in enumerate(years)])


def test_anomaly_zscore_perfect_and_partial():
    base = _clim(range(2003, 2012))
    true = np.full(12, 10.0); true[[6, 7]] = 30   # 7·8월이 이상
    pred = np.full(12, 10.0); pred[[7, 8]] = 30   # 8월은 맞히고, 9월은 헛경보, 7월은 놓침
    df = pd.concat([base, _year("A", 2012, true, pred)], ignore_index=True)
    df.loc[df.period.dt.year < 2012, "pred"] = df["modis_n"]
    # 평년: 평균 10, 표준편차 ≈0.87 → z=2 기준 ≈11.7. 평년 연도(최대 11)는 이상 없음
    r = anomaly_agreement(df, "pred", ["region"], (2003, 2011), z=2.0, method="zscore")
    assert r["n_anomalies_true"] == 2
    assert r["precision"] == 0.5 and r["recall"] == 0.5 and r["f1"] == 0.5
    assert r["n"] == 12 * 10
    # 시험 연도만: 평년값은 그대로 쓰고 2012년 12개월만 평가
    r = anomaly_agreement(df, "pred", ["region"], (2003, 2011), z=2.0, method="zscore", eval_years=(2012, 2012))
    assert r["n"] == 12 and r["f1"] == 0.5
    # df를 미리 자르면 평년값이 없어서 n=0
    r = anomaly_agreement(df[df.period.dt.year >= 2012], "pred", ["region"], (2003, 2011), method="zscore")
    assert r["n"] == 0


def test_anomaly_baseline_counts_fire_free_years():
    # 리뷰 사례 2: 8년 중 3년만 5월에 불 (0, 0, 10, 0, 12, 0, 0, 80). 격자에는 불 난 해의 행만 있다.
    # 평년 평균은 불 난 해만으로 낸 34가 아니라 12.75여야 한다.
    mays = dict(zip(range(2003, 2011), (0, 0, 10, 0, 12, 0, 0, 80)))
    a = _rows("A", [(f"{y}-05", v, v) for y, v in mays.items() if v] + [("2011-05", 20, 5)])
    # 다른 지역 B의 행이 2003-01 ~ 2011-12 를 덮는다 (실제 격자처럼 전체 기간이 깔림)
    b = _rows("B", [("2003-01", 0, 0), ("2011-12", 0, 0)])
    df = pd.concat([a, b], ignore_index=True)

    m = _monthly(df, "pred", ["region"])
    base_may = m[(m["_region"] == "A") & (m["month"] == 5) & m["year"].between(2003, 2010)]["modis_n"]
    assert len(base_may) == 8 and base_may.mean() == 12.75

    # 2011년 5월 20: 평균 12.75보다 크므로 z=0이면 이상 (불 난 해만 쓰면 34보다 작아 놓친다)
    r = anomaly_agreement(df, "pred", ["region"], (2003, 2010), z=0.0, method="zscore", eval_years=(2011, 2011))
    assert r["n_anomalies_true"] == 1 and r["recall"] == 0.0
    assert r["n"] == 24  # A, B 각 12개월


def test_anomaly_zscore_not_enough_years_returns_nan():
    df = _clim([2010, 2011])  # 평년 2년뿐
    df["pred"] = df["modis_n"]
    r = anomaly_agreement(df, "pred", ["region"], (2003, 2011), method="zscore")
    assert r["n"] == 0 and math.isnan(r["f1"])


def test_anomaly_uses_true_modis_for_baseline():
    # 평년 기간에 예측이 엉망이어도 평년값은 실제 MODIS로만 만든다
    df = _clim(range(2003, 2012)).assign(pred=1000.0)
    ev = _year("A", 2015, np.full(12, 10.0), np.full(12, 10.0))
    for method in ("zscore", "percentile"):
        r = anomaly_agreement(pd.concat([df, ev]), "pred", ["region"], (2003, 2011),
                              method=method, eval_years=(2015, 2015))
        assert r["n"] == 12 and r["n_anomalies_true"] == 0 and r["precision"] != 1.0


# ------------------------------------------------------------------ anomaly_agreement (percentile)
def _random_history(seed=0, years=range(2003, 2025), regions=("A", "B", "C")):
    rng = np.random.default_rng(seed)
    parts = []
    for reg in regions:
        for y in years:
            parts.append(_year(reg, y, rng.poisson(20, 12).astype(float)))
    return pd.concat(parts, ignore_index=True)


def test_anomaly_percentile_matches_activity_index():
    df = _random_history()
    r = anomaly_agreement(df, "modis_n", ["region"], (2003, 2023))
    t = activity.monthly_totals(df, ["modis_n"], "region")
    pct = activity.percentile(t, "modis_n", "region", years=(2003, 2023))
    assert r["n"] == int(pct.notna().sum())
    assert r["n_anomalies_true"] == int((pct >= activity.ANOMALY).sum()) > 0
    assert r["precision"] == r["recall"] == r["f1"] == 1.0
    # 같은 데이터, activity.agreement 의 이상 F1 과 같은 정의
    df["pred"] = df["modis_n"] * 1.3
    r = anomaly_agreement(df, "pred", ["region"], (2003, 2023))
    t = activity.monthly_totals(df, ["modis_n", "pred"], "region")
    a = activity.agreement(activity.percentile(t, "modis_n", "region"),
                           activity.percentile(t, "pred", "region", base_col="modis_n"))
    assert r["f1"] == pytest.approx(a["이상 F1"]) and r["n"] == a["비교한 지역-월"]
    assert r["precision"] < 1.0  # 과대 예측 → 헛경보


def test_anomaly_percentile_needs_min_baseline_years():
    df = _random_history(years=range(2003, 2003 + activity.MIN_BASELINE_YEARS - 1))
    r = anomaly_agreement(df, "modis_n", ["region"], (2003, 2023))
    assert r["n"] == 0 and math.isnan(r["f1"])


def test_anomaly_rejects_unknown_method():
    with pytest.raises(ValueError):
        anomaly_agreement(_random_history(), "modis_n", ["region"], (2003, 2023), method="mean")
