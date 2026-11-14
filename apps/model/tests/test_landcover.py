import numpy as np
import pandas as pd

from fsml.landcover import attach_landcover, majority_to_grid


def test_majority_excludes_water_and_matches_grid_index(tmp_path):
    arr = np.zeros((3600, 7200), dtype=np.uint8)  # 전부 물
    # 북위 37.0~37.5°, 동경 127.0~127.5° 칸: 물 60, 농경지(12) 25, 숲(1) 15 → 농경지
    r0, c0 = int((90 - 37.5) / 0.05), int((127.0 + 180) / 0.05)
    block = arr[r0:r0 + 10, c0:c0 + 10]
    block.flat[60:85] = 12
    block.flat[85:] = 1
    lc = majority_to_grid(arr)
    assert len(lc) == 360 * 720
    row, col = int(np.floor((90 - 37.25) / 0.5)), int(np.floor((127.25 + 180) / 0.5))
    cell = lc[(lc.row == row) & (lc.col == col)]
    assert cell.landcover.item() == 12
    assert (lc.landcover == 0).sum() == len(lc) - 1  # 나머지는 전부 물

    path = tmp_path / "lc.parquet"
    lc.to_parquet(path)
    grid = pd.DataFrame({"row": [row, row, 0], "col": [col, col, 0], "modis_n": [3, 4, 0]})
    out = attach_landcover(grid, path)
    assert list(out.landcover) == [12, 12, 0]
    assert list(out.landcover_group) == ["cropland", "cropland", "other"]
    assert len(out) == 3 and list(out.modis_n) == [3, 4, 0]


def test_tie_picks_smaller_code():
    arr = np.full((3600, 7200), 0, dtype=np.uint8)
    arr[:10, :10].flat[:50] = 9
    arr[:10, :10].flat[50:] = 4
    assert majority_to_grid(arr).landcover.iloc[0] == 4
