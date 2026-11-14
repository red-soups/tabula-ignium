import numpy as np
import pandas as pd

from fsml import korea

P = pd.Timestamp


def _points():
    rows = [
        # (sensor, lat, lon, date, frp)
        ("MODIS", 36.31, 128.71, "2001-03-05", 10.0),   # terra_scaled month
        ("MODIS", 36.32, 128.72, "2010-03-05", 20.0),   # modis month: MODIS carries, VIIRS does not (pre-2012)
        ("MODIS", 36.33, 128.91, "2010-03-06", 30.0),
        ("MODIS", 36.31, 128.71, "2025-03-05", 5.0),    # viirs_model month: VIIRS carries
        ("VIIRS", 36.31, 128.71, "2025-03-05", 1.0),
        ("VIIRS", 36.34, 128.92, "2025-03-06", 3.0),
        ("MODIS", 37.21, 127.11, "2025-04-01", 8.0),    # viirs_model month without VIIRS: MODIS carries
    ]
    df = pd.DataFrame(rows, columns=["sensor", "latitude", "longitude", "acq_date", "frp"])
    return df.assign(acq_date=pd.to_datetime(df["acq_date"]))


def _harmonized():
    # cell (row 107, col 617) holds 36.0–36.5°N, 128.5–129.0°E; (105, 614) holds 37.0–37.5°N, 127.0–127.5°E
    return pd.DataFrame({
        "row": [107, 107, 107, 105], "col": [617, 617, 617, 614],
        "period": [P("2001-03-01"), P("2010-03-01"), P("2025-03-01"), P("2025-04-01")],
        "harmonized": [3.0, 2.0, 8.0, 0.5], "low": [np.nan, np.nan, 4.0, 0.1], "high": [np.nan, np.nan, 12.0, 1.0],
        "source": ["terra_scaled", "modis", "viirs_model", "viirs_model"],
        "harmonized_frp": [np.nan, 50.0, 40.0, 4.0], "frp_low": [np.nan, np.nan, 20.0, 1.0],
        "frp_high": [np.nan, np.nan, 60.0, 9.0],
    })


def test_weights_give_back_the_cell_values():
    w = korea.weigh(_points(), _harmonized())
    by = w.groupby("period")["weight"].sum()
    assert by[P("2001-03-01")] == 3.0 and by[P("2010-03-01")] == 2.0
    assert by[P("2025-03-01")] == 8.0 and by[P("2025-04-01")] == 0.5
    m25 = w[w["period"] == P("2025-03-01")]
    assert m25.loc[m25["sensor"] == "VIIRS", "weight"].tolist() == [4.0, 4.0]   # split evenly over VIIRS points
    assert m25.loc[m25["sensor"] == "MODIS", "weight"].tolist() == [0.0]
    assert m25["weight_low"].sum() == 4.0 and m25["weight_high"].sum() == 12.0
    # FRP: own FRP in modis months, the estimate split by VIIRS FRP share (1:3) in viirs_model months
    assert w.loc[w["period"] == P("2010-03-01"), "frp_weight"].tolist() == [20.0, 30.0]
    np.testing.assert_allclose(m25.loc[m25["sensor"] == "VIIRS", "frp_weight"], [10.0, 30.0])
    assert np.isnan(w.loc[w["period"] == P("2001-03-01"), "frp_weight"]).all()
    assert korea.check(w, _harmonized().assign(lat=[36.25, 36.25, 36.25, 37.25], lon=[128.75] * 3 + [127.25]))["max_abs_gap"] == 0


def test_fallback_to_modis_and_cell_indices():
    w = korea.weigh(_points(), _harmonized())
    apr = w[w["period"] == P("2025-04-01")]
    assert apr["carrier"].tolist() == [True] and apr["weight"].tolist() == [0.5]
    first = w.iloc[0]
    assert (first["cell_row"], first["cell_col"]) == (107, 617)
    assert (first["fine_row"], first["fine_col"]) == (536, 3087)


def test_fine_grid_sums_points():
    w = korea.weigh(_points(), _harmonized())
    g = korea.fine_grid(w, {"2025-04": [10, 30]})
    assert g["harmonized"].sum() == 13.5
    assert np.isnan(g.loc[g["period"] == P("2010-03-01"), "viirs_n"]).all()     # VIIRS not flying yet
    assert g.loc[g["period"] == P("2025-04-01"), "days_observed"].tolist() == [10]


def test_inside_shapes():
    pts = pd.DataFrame({"latitude": [36.0, 36.05, 37.0], "longitude": [128.0, 128.0, 128.0]})
    assert korea.inside(pts, {"center": [36.0, 128.0], "radius_km": 10}).tolist() == [True, True, False]
    assert korea.inside(pts, {"bbox": [35.9, 36.1, 127.9, 128.1]}).tolist() == [True, True, False]
    square = [[127.5, 35.5], [128.5, 35.5], [128.5, 36.5], [127.5, 36.5], [127.5, 35.5]]
    hole = [[127.9, 35.9], [128.1, 35.9], [128.1, 36.02], [127.9, 36.02], [127.9, 35.9]]
    assert korea.inside(pts, {"type": "Polygon", "coordinates": [square]}).tolist() == [True, True, False]
    assert korea.inside(pts, {"type": "Polygon", "coordinates": [square, hole]}).tolist() == [False, True, False]
    multi = {"type": "MultiPolygon", "coordinates": [[hole], [[[127.9, 36.9], [128.1, 36.9], [128.1, 37.1], [127.9, 37.1]]]]}
    assert korea.inside(pts, multi).tolist() == [True, False, True]


def test_area_monthly_fills_months_and_projects_partial():
    w = korea.weigh(_points(), _harmonized())
    t = korea.area_monthly(w, {"bbox": [36.0, 36.5, 128.5, 129.0]}, {"2025-04": [10, 30]}).set_index("period")
    assert len(t) == 290                                         # 2001-03 … 2025-04, every month
    assert t.loc[P("2005-06-01"), "harmonized"] == 0 and t.loc[P("2005-06-01"), "source"] == "modis"
    assert t.loc[P("2025-03-01"), "harmonized"] == 8.0 and t.loc[P("2025-03-01"), "source"] == "viirs_model"
    assert t.loc[P("2025-04-01"), "harmonized"] == 0.0          # the April point lies outside the box
    assert t.loc[P("2025-04-01"), "days_observed"] == 10 and t.loc[P("2025-04-01"), "projected"] == 0.0
    assert np.isnan(t.loc[P("2010-03-01"), "viirs_n"]) and np.isnan(t.loc[P("2001-03-01"), "harmonized_frp"])
