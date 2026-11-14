import numpy as np

from fsml.intervals import contain


def test_bounds_ordered_and_widened_to_the_point():
    value = np.array([0.06, 2418.5, 5.0, 3.0, 1.0])
    low = np.array([0.0, 329.2, 6.0, 4.0, np.nan])
    high = np.array([0.04, 2415.3, 2.0, 9.0, np.nan])
    lo, hi = contain(value, low, high)
    np.testing.assert_allclose(lo[:4], [0.0, 329.2, 2.0, 3.0])
    np.testing.assert_allclose(hi[:4], [0.06, 2418.5, 6.0, 9.0])
    assert np.isnan(lo[4]) and np.isnan(hi[4])  # no bounds stays no bounds
    assert (lo[:4] <= value[:4]).all() and (value[:4] <= hi[:4]).all()
