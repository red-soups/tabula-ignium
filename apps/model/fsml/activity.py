"""Fire activity index: where a month sits against the same month in normal years.

The calendar shows this index rather than raw counts, so viewers never have to compare
"MODIS detections" with "VIIRS detections". It is computed from the harmonized series:

1. cells are summed into regions (10° blocks, a user-drawn area, ...) per month,
2. months without a row are filled with 0 (the grid only has rows where something burned),
3. each region-month is ranked against the same calendar month in BASELINE_YEARS
   (0–100 percentile, ties count half), and
4. the percentile is cut into the five LEVELS shown in the calendar.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Whole Terra + Aqua years before Terra's orbit drift shows up (2025, notebook 07).
BASELINE_YEARS = (2003, 2023)
MIN_BASELINE_YEARS = 5
LEVEL_EDGES = (10, 30, 70, 90)
LEVELS = ("매우 낮음", "낮음", "보통", "높음", "매우 높음")
ANOMALY = 90  # percentile from which a month counts as unusually active


def monthly_totals(df: pd.DataFrame, cols: list[str], region: str) -> pd.DataFrame:
    """Sum `cols` per region × month over every month from the first to the last in `df`,
    writing 0 where a region has no row.

    Like the grid itself, a column counts as operating from its first to its last month with a
    value; outside that it stays NaN. This also works when `df` holds only the cells of one
    small area, whose fire-free months have no rows at all.
    """
    month = pd.to_datetime(df["period"]).dt.to_period("M").dt.to_timestamp()
    t = df.assign(period=month).groupby([region, "period"], observed=True)[cols].sum(min_count=1)
    months = pd.date_range(month.min(), month.max(), freq="MS")
    regions = t.index.get_level_values(region).unique()
    t = t.reindex(pd.MultiIndex.from_product([regions, months], names=[region, "period"]))
    period = t.index.get_level_values("period")
    for c in cols:
        seen = period[t[c].notna().to_numpy()]
        on = (period >= seen.min()) & (period <= seen.max()) if len(seen) else np.zeros(len(t), bool)
        t.loc[on & t[c].isna().to_numpy(), c] = 0.0
    return t.reset_index()


def percentile(totals: pd.DataFrame, col: str, region: str, base_col: str | None = None,
               years: tuple[int, int] = BASELINE_YEARS) -> pd.Series:
    """Percentile (0–100) of `col` against `base_col` in the same region and calendar month
    over `years`. `base_col` defaults to `col`; validation ranks predictions against the
    observed MODIS normal, as the calendar does once MODIS has stopped."""
    base_col = base_col or col
    period = pd.to_datetime(totals["period"])
    keys = [totals[region].to_numpy(), period.dt.month.to_numpy()]
    in_base = period.dt.year.between(*years).to_numpy() & totals[base_col].notna().to_numpy()
    # Ranked as whole detections: an estimate of 0.01 in a month that never burned is "0 detections"
    # (normal), not above every baseline year. Without this, 162 of 589 "매우 높음" region-months in
    # 2025 (10° regions, VIIRS-based) were months with zero fires in all 21 baseline years.
    base_values = np.round(totals[base_col].to_numpy(float)[in_base])
    base = (pd.Series(base_values, index=pd.MultiIndex.from_arrays([k[in_base] for k in keys]))
            .groupby(level=[0, 1]).apply(lambda s: np.sort(s.to_numpy())))
    values = np.round(totals[col].to_numpy(float))
    out = np.full(len(totals), np.nan)
    for key, idx in pd.Series(np.arange(len(totals))).groupby(keys).indices.items():
        b = base.get(key)
        if b is None or len(b) < MIN_BASELINE_YEARS:
            continue
        v = values[idx]
        below = np.searchsorted(b, v, side="left")
        ties = np.searchsorted(b, v, side="right") - below
        out[idx] = np.where(np.isnan(v), np.nan, 100 * (below + 0.5 * ties) / len(b))
    return pd.Series(out, index=totals.index, name=f"{col}_pct")


def level(pct: pd.Series) -> pd.Series:
    """Five calendar levels from the percentile (매우 낮음 < 10 ≤ 낮음 < 30 ≤ 보통 < 70 ≤ 높음 < 90 ≤ 매우 높음)."""
    codes = np.digitize(pct.to_numpy(float), LEVEL_EDGES)
    names = np.array(LEVELS, dtype=object)[np.clip(codes, 0, len(LEVELS) - 1)]
    return pd.Series(pd.Categorical(np.where(pct.isna(), None, names), categories=LEVELS, ordered=True),
                     index=pct.index)


def activity_index(df: pd.DataFrame, value_col: str, region: str,
                   years: tuple[int, int] = BASELINE_YEARS) -> pd.DataFrame:
    """Region × month table with the total, the normal (baseline median), percentile and level."""
    t = monthly_totals(df, [value_col], region)
    t["percentile"] = percentile(t, value_col, region, years=years)
    t["level"] = level(t["percentile"])
    period = pd.to_datetime(t["period"])
    base = t[period.dt.year.between(*years)]
    normal = base.groupby([base[region], pd.to_datetime(base["period"]).dt.month])[value_col].median()
    t["normal"] = pd.MultiIndex.from_arrays([t[region], period.dt.month]).map(normal)
    return t


def agreement(true_pct: pd.Series, pred_pct: pd.Series) -> dict[str, float]:
    """How well an index built from estimates matches the one built from observed MODIS."""
    ok = true_pct.notna() & pred_pct.notna()
    t, p = true_pct[ok], pred_pct[ok]
    lt = np.digitize(t.to_numpy(), LEVEL_EDGES)
    lp = np.digitize(p.to_numpy(), LEVEL_EDGES)
    at, ap = t.to_numpy() >= ANOMALY, p.to_numpy() >= ANOMALY
    tp = int((at & ap).sum())
    precision = tp / ap.sum() if ap.sum() else np.nan
    recall = tp / at.sum() if at.sum() else np.nan
    f1 = 2 * precision * recall / (precision + recall) if precision + recall > 0 else np.nan
    return {
        "단계 일치": float((lt == lp).mean()),
        "±1단계 이내": float((np.abs(lt - lp) <= 1).mean()),
        "이상 정밀도": float(precision),
        "이상 재현율": float(recall),
        "이상 F1": float(f1),
        "백분위 상관": float(np.corrcoef(t, p)[0, 1]),
        "비교한 지역-월": int(ok.sum()),
    }
