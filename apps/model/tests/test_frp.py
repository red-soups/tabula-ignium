import numpy as np
import pandas as pd

from fsml import frp
from fsml.baseline import RatioBaseline

P = pd.Timestamp


def _harmonized():
    return pd.DataFrame({
        "row": [1, 1, 1, 1, 2],
        "col": [5, 5, 5, 5, 6],
        "period": [P("2001-01-01"), P("2010-01-01"), P("2025-01-01"), P("2026-01-01"), P("2026-01-01")],
        "harmonized": [3.0, 4.0, 5.0, 6.0, 7.0],
        "source": ["terra_scaled", "modis", "viirs_model", "viirs_model", "viirs_model"],
    })


def _grid(periods, modis_frp, viirs_frp):
    n = len(periods)
    return pd.DataFrame({"row": [1] * n, "col": [5] * n, "period": periods,
                         frp.TARGET: modis_frp, frp.SOURCE: viirs_frp})


ARCHIVE = _grid([P("2001-01-01"), P("2010-01-01"), P("2025-01-01")], [30.0, 40.0, 50.0], [np.nan, np.nan, 60.0])
CURRENT = pd.concat([_grid([P("2026-01-01")], [70.0], [80.0]),
                     pd.DataFrame({"row": [2], "col": [6], "period": [P("2026-01-01")],
                                   frp.TARGET: [1.0], frp.SOURCE: [2.0]})], ignore_index=True)


def _fake_predict(grid, model, interval, res):
    # Prediction = 10 × VIIRS FRP with a range around it (the real predict runs intervals.contain).
    g = grid[grid[frp.SOURCE].notna()]
    pred = 10 * g[frp.SOURCE].to_numpy(float)
    return g[frp.KEYS].assign(frp_pred=pred, frp_low=pred - 1, frp_high=pred + 2)


def _attach(monkeypatch, converted, with_range=True, h=None):
    monkeypatch.setattr(frp, "predict", _fake_predict)
    return frp.attach(_harmonized() if h is None else h, [ARCHIVE, CURRENT], converted, None, None, 0.5, with_range)


def test_value_per_source(monkeypatch):
    out = _attach(monkeypatch, [ARCHIVE, CURRENT]).set_index("period")
    first = out[out["row"] == 1]
    assert np.isnan(first.loc[P("2001-01-01"), "harmonized_frp"])          # terra_scaled: cannot scale FRP
    assert first.loc[P("2010-01-01"), "harmonized_frp"] == 40.0            # modis: observed
    assert first.loc[P("2025-01-01"), "harmonized_frp"] == 600.0           # viirs_model: model
    assert first.loc[P("2026-01-01"), "harmonized_frp"] == 800.0
    assert first.loc[P("2026-01-01"), "modis_frp_sum"] == 70.0 and first.loc[P("2026-01-01"), "viirs_frp_sum"] == 80.0


def test_range_only_on_model_rows(monkeypatch):
    out = _attach(monkeypatch, [ARCHIVE, CURRENT])
    model = out["source"] == "viirs_model"
    assert out.loc[~model, ["frp_low", "frp_high"]].isna().all().all()
    m = out[model]
    assert ((m["frp_low"] <= m["harmonized_frp"]) & (m["harmonized_frp"] <= m["frp_high"])).all()
    assert out.loc[out["source"] == "viirs_model", "frp_low"].notna().all()


def test_without_range(monkeypatch):
    out = _attach(monkeypatch, [ARCHIVE, CURRENT], with_range=False)
    assert out[["frp_low", "frp_high"]].isna().all().all()
    assert out["harmonized_frp"].notna().sum() == 4


def test_months_outside_converted_grids_stay_empty(monkeypatch):
    out = _attach(monkeypatch, [ARCHIVE])   # e.g. NOAA-20 not approved
    y2026 = out[out["period"] == P("2026-01-01")]
    assert y2026["harmonized_frp"].isna().all()
    assert y2026["modis_frp_sum"].notna().all()  # observed totals still filled


def test_replaces_existing_columns_and_keeps_rows(monkeypatch):
    once = _attach(monkeypatch, [ARCHIVE, CURRENT])
    once.attrs = {"through": "2026-01-31"}
    twice = _attach(monkeypatch, [ARCHIVE, CURRENT], h=once)
    assert len(twice) == len(_harmonized())
    assert list(twice.columns).count("harmonized_frp") == 1
    assert twice.attrs == {"through": "2026-01-31"}
    pd.testing.assert_series_equal(once["harmonized_frp"], twice["harmonized_frp"])


def test_ratio_baseline_on_frp_columns():
    df = pd.DataFrame({"lat": [5.0, 5.0], "period": [P("2015-03-01"), P("2016-03-01")],
                       frp.TARGET: [100.0, 300.0], frp.SOURCE: [100.0, 100.0],
                       "modis_n": [1.0, 1.0], "viirs_n": [99.0, 99.0]})
    base = RatioBaseline(min_viirs=1, target=frp.TARGET, source=frp.SOURCE).fit(df)
    np.testing.assert_allclose(base.predict(df), [200.0, 200.0])
