"""Wildfire history statement ("산불 이력 확인서"): the items a user ticks, computed for one area.

Every value comes from fsml.korea's weighted points, so the area can be anything (a drawn polygon, a radius
around a site, a box). `build` returns a JSON-ready dict, laid out in packages/shared-schemas (section 5):

    {"meta": {...}, "items": {"A1": {"title": ..., ...}, "B2": {...}, ...}}

A: what was detected in the requested period. B: the long record on the MODIS (Terra + Aqua) scale, which is
what the harmonization makes possible. C: how far to trust it.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import activity, korea

KST = timezone(timedelta(hours=9))
ITEMS = {
    "A1": "화재 감지 목록", "A2": "감지 지도", "A3": "가장 가까운 화재",
    "B1": "연도별 화재 추이", "B2": "월별 달력", "B3": "큰 산불 발생 빈도", "B4": "고위험 시기",
    "B5": "최근 추세", "B6": "불 세기(FRP) 이력", "B7": "센서 교체 보정",
    "C1": "불확실성 범위", "C2": "데이터 출처와 방법", "C3": "한계", "C4": "인용 문구",
}
MAX_DETECTIONS = 5000
FULL_YEARS = (2001, 2025)      # whole years on record (2000 starts in November, the current year is running)
RECENT_YEARS = 5
EVENT_RATIO, EVENT_MIN = 3.0, 5.0   # large-fire month: ≥ 3 × its normal and ≥ 5 MODIS-equivalent detections
NEAR_KM = (1, 5, 10)
SATELLITES = {"T": "Terra", "Terra": "Terra", "A": "Aqua", "Aqua": "Aqua", "N": "Suomi NPP", "N20": "NOAA-20", "N21": "NOAA-21"}
NOTES = {
    "A1": "MODIS와 VIIRS는 같은 불을 각각 감지하므로 두 센서의 건수를 더하지 않습니다.",
    "A3": "조회 기간에 한국 범위 안에서 감지된 화재가 없습니다.",
    "B6": "2002년 6월까지(Terra만 있던 시기)는 위성별 FRP가 없어 비워 둡니다.",
    "B7": "원본을 이어 붙이면(2011년까지 MODIS, 2012년부터 VIIRS) 센서가 바뀐 해에 숫자가 뛰어 산불이 는 것처럼 보입니다. "
          "harmonized는 전 기간을 MODIS 기준 한 눈금으로 맞춘 값입니다.",
}
CITATION = ("Tabula Ignium 산불 이력 확인서 {document_id} ({issued_date} 발급). NASA FIRMS MODIS C6.1·VIIRS 375 m 활성 화재 자료를 "
            "MODIS(Terra+Aqua) 기준으로 조화한 값, {data_through} 관측까지.")
VALIDATION = {
    "count": "2020–2024년을 한 해씩 가리고 시험: 10° 지역 월 합계 오차가 규칙 기반 방법보다 33% 작음(149.6 vs 221.1), 편향 −0.3%",
    "noaa20": "NOAA-20(학습에 쓰지 않은 위성)을 넣어도 오차 118.9로 통과",
    "calendar": "평년 대비 5단계 일치 67%, ±1단계 95%, '매우 높음' 판정 F1 0.67",
    "frp": "FRP(불 세기): 비율 기준선보다 합계 오차 39% 작음, 5년 모두 우세",
    "split": "0.5° 값을 감지점으로 나누기: 한국 2013–2024에서 실제 MODIS와 상관 0.78(면적으로 똑같이 나누면 0.32)",
    "coverage": "80% 범위 시험 포함률: 탐지 수 81.4%, FRP 83.4%",
}


def _num(x, nd: int = 2):
    if x is None or (isinstance(x, float) and math.isnan(x)) or pd.isna(x):
        return None
    return round(float(x), nd)


def _kst(df: pd.DataFrame) -> pd.Series:
    t = df["acq_time_utc"].astype(str).str.zfill(4)
    utc = pd.to_datetime(df["acq_date"]) + pd.to_timedelta(t.str[:2].astype(int) * 60 + t.str[2:].astype(int), unit="min")
    return (utc + pd.Timedelta(hours=9)).dt.strftime("%Y-%m-%d %H:%M")


def _haversine(lat, lon, lat0, lon0) -> np.ndarray:
    la, lo, la0, lo0 = (np.radians(np.asarray(v, float)) for v in (lat, lon, lat0, lon0))
    h = np.sin((la - la0) / 2) ** 2 + np.cos(la0) * np.cos(la) * np.sin((lo - lo0) / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(h))


def area_info(area: dict) -> dict:
    """Kind, reference point (circle centre or polygon/box centre), bounding box and approximate size."""
    if "radius_km" in area:
        lat, lon = area["center"]
        r = area["radius_km"]
        dlat, dlon = r / 111.32, r / (111.32 * math.cos(math.radians(lat)))
        return {"kind": "circle", "center": [lat, lon], "radius_km": r, "area_km2": _num(math.pi * r * r, 1),
                "bbox": [_num(lat - dlat, 4), _num(lat + dlat, 4), _num(lon - dlon, 4), _num(lon + dlon, 4)]}
    if "bbox" in area:
        s, n, w, e = area["bbox"]
        km2 = (n - s) * 111.32 * (e - w) * 111.32 * math.cos(math.radians((s + n) / 2))
        return {"kind": "bbox", "center": [(s + n) / 2, (w + e) / 2], "area_km2": _num(km2, 1), "bbox": [s, n, w, e]}
    polygons = area["coordinates"] if area["type"] == "MultiPolygon" else [area["coordinates"]]
    km2, pts = 0.0, []
    for rings in polygons:
        for k, ring in enumerate(rings):
            r = np.asarray(ring, float)
            x = r[:, 0] * 111.32 * np.cos(np.radians(r[:, 1].mean()))
            y = r[:, 1] * 111.32
            a = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
            km2 += -a if k else a
            if not k:
                pts.append(r[:-1] if len(r) > 1 and (r[0] == r[-1]).all() else r)  # closed ring: drop the repeat
    allp = np.vstack(pts)
    return {"kind": "polygon", "center": [float(allp[:, 1].mean()), float(allp[:, 0].mean())], "area_km2": _num(km2, 1),
            "bbox": [float(allp[:, 1].min()), float(allp[:, 1].max()), float(allp[:, 0].min()), float(allp[:, 0].max())]}


# ---------------------------------------------------------------- items
def _detections(p: pd.DataFrame) -> list[dict]:
    rows = p.assign(kst=_kst(p)).sort_values(["kst", "sensor"])
    return [{"sensor": r.sensor, "satellite": SATELLITES.get(str(r.satellite), str(r.satellite)), "acq_datetime_kst": r.kst,
             "latitude": _num(r.latitude, 5), "longitude": _num(r.longitude, 5), "confidence_level": r.confidence_level,
             "frp": _num(r.frp, 2), "daynight": r.daynight, "data_source": r.data_source}
            for r in rows.head(MAX_DETECTIONS).itertuples()]


def _a1(p):
    by = p["sensor"].value_counts().to_dict()
    return {"count": int(len(p)), "by_sensor": {k: int(v) for k, v in by.items()},
            "truncated": bool(len(p) > MAX_DETECTIONS), "rows": _detections(p),
            "note": NOTES["A1"]}


def _a2(p, info, area):
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [d["longitude"], d["latitude"]]},
              "properties": {k: d[k] for k in ("sensor", "acq_datetime_kst", "frp")}} for d in _detections(p)]
    return {"area": area, "bbox": info["bbox"], "points": {"type": "FeatureCollection", "features": feats}}


def _a3(window, info):
    if window.empty:
        return {"found": False, "note": NOTES["A3"]}
    d = _haversine(window["latitude"], window["longitude"], *info["center"])
    i = int(np.argmin(d))
    r = window.iloc[[i]]
    return {"found": True, "reference_point": info["center"], "distance_km": _num(d[i], 2),
            "nearest": _detections(r)[0], "counts_within_km": {str(k): int((d <= k).sum()) for k in NEAR_KM}}


def _annual(t: pd.DataFrame, through: str | None) -> pd.DataFrame:
    y = t.assign(year=t["period"].dt.year).groupby("year")
    out = pd.DataFrame({
        "harmonized": y["harmonized"].sum(), "low": y["low"].sum(min_count=1), "high": y["high"].sum(min_count=1),
        "harmonized_frp": y["harmonized_frp"].sum(min_count=1), "frp_months": y["harmonized_frp"].count(),
        "modis_n": y["modis_n"].sum(), "viirs_n": y["viirs_n"].sum(min_count=1), "months": y["period"].count(),
        "sources": y["source"].agg(lambda s: sorted(set(s.dropna()))),
    })
    out["complete"] = out["months"] == 12
    if through and not through.endswith("-12-31"):   # the year still running
        out.loc[int(through[:4]), "complete"] = False
    return out


def _b1(a):
    return {"unit": "MODIS(Terra+Aqua) 기준 감지 수", "years": [
        {"year": int(y), "harmonized": _num(r.harmonized, 1), "low": _num(r.low, 1), "high": _num(r.high, 1),
         "complete": bool(r.complete), "sources": r.sources} for y, r in a.iterrows()]}


def _b2(t, start: date, end: date):
    m = t[(t["period"] >= pd.Timestamp(start.replace(day=1))) & (t["period"] <= pd.Timestamp(end))]
    return {"months": [{"period": r.period.strftime("%Y-%m"), "harmonized": _num(r.harmonized, 1), "low": _num(r.low, 1),
                        "high": _num(r.high, 1), "normal": _num(r.normal, 1), "percentile": _num(r.percentile, 1),
                        "level": None if pd.isna(r.level) else str(r.level), "days_observed": _num(r.days_observed, 0),
                        "projected": _num(r.projected, 1), "source": r.source} for r in m.itertuples()],
            "baseline_years": list(activity.BASELINE_YEARS), "level_edges": list(activity.LEVEL_EDGES)}


def _b3(t):
    full = t[t["period"].dt.year.between(*FULL_YEARS)]
    event = full["harmonized"] >= np.maximum(EVENT_RATIO * full["normal"].fillna(0), EVENT_MIN)
    years = sorted(full.loc[event, "period"].dt.year.unique().tolist())
    n_years = FULL_YEARS[1] - FULL_YEARS[0] + 1
    fire_years = int((full.groupby(full["period"].dt.year)["harmonized"].sum() >= 1).sum())
    top = full.nlargest(3, "harmonized")
    return {"years_considered": list(FULL_YEARS), "rule": f"평년의 {EVENT_RATIO:g}배 이상이면서 {EVENT_MIN:g}건 이상 탄 달",
            "years_with_large_fire": years, "count": len(years),
            "return_period_years": _num(n_years / len(years), 1) if years else None,
            "years_with_any_fire": fire_years,
            "largest_months": [{"period": r.period.strftime("%Y-%m"), "harmonized": _num(r.harmonized, 1),
                                "times_normal": _num(r.harmonized / r.normal, 1) if r.normal else None}
                               for r in top.itertuples() if r.harmonized > 0]}


def _b4(t):
    base = t[t["period"].dt.year.between(*activity.BASELINE_YEARS)]
    mean = base.groupby(base["period"].dt.month)["harmonized"].mean().reindex(range(1, 13), fill_value=0.0)
    total = mean.sum()
    share = mean / total if total > 0 else mean * 0
    high = [int(m) for m in share.index if share[m] >= 1.5 / 12]
    return {"baseline_years": list(activity.BASELINE_YEARS), "high_risk_months": high,
            "peak_month": int(mean.idxmax()) if total > 0 else None,
            "months": [{"month": int(m), "mean": _num(mean[m], 2), "share": _num(share[m], 3)} for m in mean.index],
            "rule": "평년 월평균이 1년 평균(1/12)의 1.5배 이상인 달"}


def _b5(a):
    full = a[a["complete"]]
    last = int(full.index.max())
    recent = full.loc[last - RECENT_YEARS + 1:last, "harmonized"]
    base = full.loc[activity.BASELINE_YEARS[0]:activity.BASELINE_YEARS[1], "harmonized"]
    bm = base.mean()
    return {"recent_years": [int(recent.index.min()), last], "recent_mean": _num(recent.mean(), 1),
            "baseline_years": list(activity.BASELINE_YEARS), "baseline_mean": _num(bm, 1),
            "ratio": _num(recent.mean() / bm, 2) if bm > 0 else None,
            "last_year": last, "last_year_ratio": _num(full.loc[last, "harmonized"] / bm, 2) if bm > 0 else None}


def _b6(a):
    return {"unit": "MW (MODIS 기준 FRP 합계)", "years": [
        {"year": int(y), "harmonized_frp": _num(r.harmonized_frp, 1),
         "mw_per_detection": _num(r.harmonized_frp / r.harmonized, 1) if r.harmonized >= 1 and pd.notna(r.harmonized_frp) else None,
         "complete": bool(r.complete and r.frp_months == 12)} for y, r in a.iterrows()],
        "note": NOTES["B6"]}


def _b7(a):
    both = a[(a.index >= 2012) & (a.index <= 2024) & (a["modis_n"] > 0)]
    ratio = both["viirs_n"].sum() / both["modis_n"].sum() if len(both) and both["modis_n"].sum() > 0 else None
    return {"switch_year": 2012, "raw_viirs_to_modis_ratio": _num(ratio, 2),
            "ratio_based_on": {"raw_modis": int(both["modis_n"].sum()), "raw_viirs": int(both["viirs_n"].sum())}, "years": [
        {"year": int(y), "raw_modis": int(r.modis_n), "raw_viirs": None if pd.isna(r.viirs_n) else int(r.viirs_n),
         "raw_stitched": int(r.modis_n if y < 2012 else (r.viirs_n if pd.notna(r.viirs_n) else 0)),
         "harmonized": _num(r.harmonized, 1)} for y, r in a.iterrows()],
        "note": NOTES["B7"]}


def _c1():
    return {"level": 0.8, "tested_coverage": {"count": 0.814, "frp": 0.834},
            "note": "범위(low~high)는 AI가 VIIRS로 계산한 달(2025년~)에만 있습니다. 실제 값이 이 범위 안에 들 확률이 약 80%가 되도록 "
                    "맞췄습니다. 작은 지역의 범위는 0.5° 칸 범위를 감지점 비율로 나눈 근사값이며, 여러 점을 합친 범위는 실제보다 조금 넓습니다."}


def _c2():
    return {"data": [
        {"name": "NASA FIRMS MODIS Collection 6.1 (MCD14)", "satellites": "Terra, Aqua", "period": "2000-11 ~"},
        {"name": "NASA FIRMS VIIRS 375 m (VNP14IMG)", "satellites": "Suomi NPP", "period": "2012-01 ~ 2025-12"},
        {"name": "NASA FIRMS VIIRS 375 m (VJ114IMG)", "satellites": "NOAA-20", "period": "2026-01 ~"}],
        "filter": "식생 화재(type = 0)만 사용, 화산·공장 등 고정 열원 제외",
        "model": "LightGBM(단조 제약, Tweedie)으로 VIIRS 0.5° 칸 × 월 값을 MODIS(Terra+Aqua) 기준으로 변환, 감지점 단위로 나눔",
        "sources": {"terra_scaled": "2000-11 ~ 2002-06: Terra만 있던 시기, Terra+Aqua 비율로 보정",
                    "modis": "2002-07 ~ 2024-12: 실제 MODIS",
                    "viirs_model": "2025-01 ~: VIIRS를 AI로 변환 (MODIS 위성 궤도 변화로 실제 MODIS를 쓰지 않음)"},
        "validation": VALIDATION}


def _c3():
    return {"items": [
        "위성이 지나갈 때(하루 몇 번)만 관측하므로 그 사이에 시작되고 꺼진 불은 빠질 수 있습니다.",
        "구름이나 짙은 연기 아래의 불, 아주 작은 불은 감지되지 않을 수 있습니다.",
        "감지 위치는 화소 중심이며 MODIS는 1~5 km, VIIRS는 약 375 m의 위치 오차가 있습니다.",
        "2025년부터의 값은 AI 추정치이며 범위를 함께 보아야 합니다.",
        "농업 소각 등 산불이 아닌 식생 화재도 포함될 수 있습니다.",
        "이 확인서는 위성 관측에 근거한 참고 자료이며 법적 효력이 있는 증명서가 아닙니다. 공식 통계는 산림청 자료를 따릅니다."]}


def _c4(doc_id: str, through: str | None, issued: str):
    return {"text": CITATION.format(document_id=doc_id, issued_date=issued[:10], data_through=through or "최신")}


def static() -> dict:
    """Everything in a statement that does not depend on the area: for a backend that computes the numbers in SQL
    (packages/shared-schemas/report.sql) and takes the words from here (report-static.json)."""
    return {"title": "산불 이력 확인서", "items": ITEMS, "notes": NOTES, "satellites": SATELLITES,
            "rules": {"baseline_years": list(activity.BASELINE_YEARS), "level_edges": list(activity.LEVEL_EDGES),
                      "level_names": list(activity.LEVELS), "full_years": list(FULL_YEARS), "recent_years": RECENT_YEARS,
                      "large_fire_month": {"times_normal": EVENT_RATIO, "min_detections": EVENT_MIN},
                      "high_risk_share": 1.5 / 12, "near_km": list(NEAR_KM), "max_detections": MAX_DETECTIONS},
            "C1": _c1(), "C2": _c2(), "C3": _c3(), "C4_template": CITATION}


# ---------------------------------------------------------------- document
def build(weighted: pd.DataFrame, area: dict, start: date, end: date, items: list[str] | None = None,
          partial: dict | None = None, through: str | None = None, issued_at: datetime | None = None,
          name: str | None = None) -> dict:
    """The statement for `area` (see fsml.korea.inside) and the period start … end (inclusive)."""
    items = [i for i in (items or list(ITEMS)) if i in ITEMS]
    issued = (issued_at or datetime.now(KST)).astimezone(KST).isoformat(timespec="seconds")
    key = json.dumps({"area": area, "start": str(start), "end": str(end), "items": items, "through": through}, sort_keys=True)
    doc_id = "TI-" + hashlib.sha1(key.encode()).hexdigest()[:10].upper()
    info = area_info(area)

    window = weighted[(weighted["acq_date"] >= pd.Timestamp(start)) & (weighted["acq_date"] <= pd.Timestamp(end))]
    in_area = window[korea.inside(window, area)] if len(window) else window
    t = korea.area_monthly(weighted, area, partial)
    a = _annual(t, through)

    make = {
        "A1": lambda: _a1(in_area), "A2": lambda: _a2(in_area, info, area), "A3": lambda: _a3(window, info),
        "B1": lambda: _b1(a), "B2": lambda: _b2(t, start, end), "B3": lambda: _b3(t), "B4": lambda: _b4(t),
        "B5": lambda: _b5(a), "B6": lambda: _b6(a), "B7": lambda: _b7(a),
        "C1": _c1, "C2": _c2, "C3": _c3, "C4": lambda: _c4(doc_id, through, issued),
    }
    return {
        "meta": {"document_id": doc_id, "title": "산불 이력 확인서", "name": name, "issued_at": issued,
                 "period": {"start": str(start), "end": str(end)}, "data_through": through,
                 "record_start": t["period"].min().strftime("%Y-%m"), "area": info, "items": items},
        "items": {i: {"title": ITEMS[i], **make[i]()} for i in items},
    }
