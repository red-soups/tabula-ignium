import numpy as np
import pandas as pd

from fsml import webexport


def _table():
    """Two 0.5° cells in one 1° cell and one far away, 2002-05 … 2025-02."""
    periods = pd.date_range("2002-05-01", "2025-02-01", freq="MS")
    src = np.where(periods < "2002-07-01", "terra_scaled", np.where(periods >= "2025-01-01", "viirs_model", "modis"))
    rows = []
    for lat, lon in [(10.25, 20.25), (10.75, 20.75), (-40.25, 150.25)]:
        for i, (p, s) in enumerate(zip(periods, src)):
            if i % 3 == 0 and lat < 0:
                continue  # the far cell has fire-free months with no row at all
            v = float(1 + i % 12)
            rows.append((lat, lon, p, v, v * 0.5, v * 2.0, s))
    return pd.DataFrame(rows, columns=["lat", "lon", "period", "harmonized", "low", "high", "source"])


def test_round_trip_keeps_totals_and_sources(tmp_path):
    h = _table()
    webexport.write(h, tmp_path)
    w = webexport.read(tmp_path)
    m = w["manifest"]
    assert m["n_cells"] == 2
    assert m["periods"]["start"] == "2002-05" and m["periods"]["count"] == len(w["periods"])
    assert m["source"][:2] == ["terra_scaled", "terra_scaled"] and m["source"][-1] == "viirs_model"
    assert m["range_periods"] == ["2025-01", "2025-02"]
    np.testing.assert_allclose(w["counts"].sum(dtype=np.float64), h["harmonized"].sum())
    # Missing rows of the far cell become 0, not gaps.
    far = webexport.cells_in(w, -41, -40, 150, 151)
    assert len(far) == 1 and (w["counts"][far[0]] == 0).sum() > 0


def test_calendar_sums_cells_in_box_and_ranks(tmp_path):
    h = _table()
    webexport.write(h, tmp_path)
    w = webexport.read(tmp_path)
    cal = webexport.calendar(w, 10, 11, 20, 21)
    direct = h[h["lat"] > 0].groupby("period")["harmonized"].sum()
    np.testing.assert_allclose(cal.set_index("period")["count"], direct)
    assert cal["level"].between(0, 5).all()
    est = cal[cal["source"] == "viirs_model"]
    assert est["estimated"].all() and (est["low"] < est["count"]).all() and (est["high"] > est["count"]).all()
    assert cal.loc[cal["source"] == "modis", "low"].isna().all()
