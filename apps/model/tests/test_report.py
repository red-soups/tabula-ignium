import json
from datetime import date, datetime

import numpy as np
import pandas as pd

from fsml import report

P = pd.Timestamp


def _weighted():
    """Two points per year in one spot (MODIS 2001–2024, VIIRS 2012–), a big March 2025, one far point."""
    rows = []
    for y in range(2001, 2026):
        src = "terra_scaled" if y < 2002 else ("modis" if y <= 2024 else "viirs_model")
        for m in (3, 4):
            rows.append(("MODIS", "T", 36.30, 128.70, f"{y}-{m:02d}-10", "0230", 5.0, src, src != "viirs_model",
                         3.0 if src == "terra_scaled" else (1.0 if src == "modis" else 0.0)))
            if y >= 2012:
                rows.append(("VIIRS", "N", 36.31, 128.71, f"{y}-{m:02d}-10", "0420", 2.0, src, src == "viirs_model",
                             (40.0 if m == 3 and y == 2025 else 1.0) if src == "viirs_model" else 0.0))
    rows.append(("VIIRS", "N20", 37.5, 127.0, "2025-03-15", "0400", 9.0, "viirs_model", True, 1.0))
    df = pd.DataFrame(rows, columns=["sensor", "satellite", "latitude", "longitude", "acq_date", "acq_time_utc", "frp",
                                     "source", "carrier", "weight"])
    df["acq_date"] = pd.to_datetime(df["acq_date"])
    df["period"] = df["acq_date"].dt.to_period("M").dt.to_timestamp()
    model = df["source"] == "viirs_model"
    df["weight_low"] = np.where(model, df["weight"] * 0.5, np.nan)
    df["weight_high"] = np.where(model, df["weight"] * 1.5, np.nan)
    df["frp_weight"] = np.where(df["source"] == "modis", np.where(df["carrier"], df["frp"], 0.0),
                                np.where(model, df["weight"] * 10, np.nan))
    df["frp_weight_low"] = np.where(model, df["frp_weight"] * 0.5, np.nan)
    df["frp_weight_high"] = np.where(model, df["frp_weight"] * 1.5, np.nan)
    return df.assign(confidence_level="nominal", daynight="D", data_source="SP")


AREA = {"center": [36.30, 128.70], "radius_km": 5}


def _doc(items=None, **kw):
    return report.build(_weighted(), AREA, date(2025, 3, 1), date(2025, 4, 30), items, through="2025-12-31",
                        issued_at=datetime(2026, 11, 15, 9, 0), **kw)


def test_only_ticked_items_and_stable_id():
    doc = _doc(["B2", "A1", "Z9"])
    assert list(doc["items"]) == ["B2", "A1"] and doc["meta"]["items"] == ["B2", "A1"]
    assert doc["meta"]["document_id"] == _doc(["B2", "A1"])["meta"]["document_id"]
    assert doc["meta"]["document_id"] != _doc(["B2"])["meta"]["document_id"]
    json.dumps(_doc(), allow_nan=False)  # every item serialises, NaN written as null


def test_detections_and_nearest():
    doc = _doc(["A1", "A2", "A3"])
    a1 = doc["items"]["A1"]
    assert a1["count"] == 4 and a1["by_sensor"] == {"MODIS": 2, "VIIRS": 2}    # the far point is outside 5 km
    assert a1["rows"][0]["acq_datetime_kst"] == "2025-03-10 11:30" and a1["rows"][0]["satellite"] == "Terra"
    assert len(doc["items"]["A2"]["points"]["features"]) == 4
    a3 = doc["items"]["A3"]
    assert a3["distance_km"] == 0.0 and a3["counts_within_km"] == {"1": 2, "5": 4, "10": 4}   # VIIRS points 1.4 km off


def test_calendar_and_history():
    it = _doc()["items"]
    b2 = {m["period"]: m for m in it["B2"]["months"]}
    assert b2["2025-03"]["harmonized"] == 40.0 and b2["2025-03"]["level"] == "매우 높음"
    assert b2["2025-03"]["low"] == 20.0 and b2["2025-04"]["harmonized"] == 1.0
    years = {y["year"]: y for y in it["B1"]["years"]}
    assert years[2001]["harmonized"] == 6.0 and years[2010]["harmonized"] == 2.0 and years[2025]["harmonized"] == 41.0
    assert it["B3"]["years_with_large_fire"] == [2025] and it["B3"]["return_period_years"] == 25.0
    assert it["B4"]["high_risk_months"] == [3, 4]
    # the test record ends in 2025-04, so 2024 is the last complete year
    assert it["B5"]["recent_years"] == [2020, 2024] and it["B5"]["baseline_mean"] == 2.0 and it["B5"]["ratio"] == 1.0
    b7 = {y["year"]: y for y in it["B7"]["years"]}
    assert b7[2011]["raw_stitched"] == 2 and b7[2012]["raw_stitched"] == 2 and it["B7"]["raw_viirs_to_modis_ratio"] == 1.0
    b6 = {y["year"]: y for y in it["B6"]["years"]}
    assert b6[2001]["harmonized_frp"] is None and b6[2010]["harmonized_frp"] == 10.0


def test_polygon_area_info():
    square = {"type": "Polygon", "coordinates": [[[128.0, 36.0], [129.0, 36.0], [129.0, 37.0], [128.0, 37.0], [128.0, 36.0]]]}
    info = report.area_info(square)
    assert info["kind"] == "polygon" and info["center"] == [36.5, 128.5]
    assert 9_000 < info["area_km2"] < 10_000
