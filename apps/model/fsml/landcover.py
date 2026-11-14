"""MODIS 토지 피복(MCD12C1, 0.05°, IGBP)을 격자 칸별 `landcover` 열로 만든다.

- 0.05° 화소를 res(기본 0.5°) 칸으로 묶고, 물을 뺀 화소 중 가장 많은 IGBP 클래스를 칸의 값으로 한다.
  칸 번호는 fsml/aggregate.py와 같다: row = floor((90 - lat) / res), col = floor((lon + 180) / res).
- 칸 전체가 물(또는 값 없음)이면 landcover = 0 (물).
- 동률이면 코드가 작은 클래스를 고른다.

MCD12C1 `Majority_Land_Cover_Type_1` (IGBP) 코드
  0 물, 1 상록침엽수림, 2 상록활엽수림, 3 낙엽침엽수림, 4 낙엽활엽수림, 5 혼효림,
  6 밀집 관목, 7 개방 관목, 8 수목 사바나, 9 사바나, 10 초원, 11 영구 습지,
  12 농경지, 13 도시, 14 농경지·자연 식생 혼재, 15 눈·얼음, 16 나지, 255 미분류
  (MCD12Q1은 물이 17번이다. 혹시 섞여 들어와도 물로 처리되도록 17도 물로 본다.)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .paths import PROCESSED

DEFAULT_LAYER = "Majority_Land_Cover_Type_1"
SRC_RES = 0.05
WATER_CODES = (0, 17)
FILL_CODES = (254, 255)
N_CLASSES = 17  # 0..16

# 규칙 모델 그룹이 너무 잘게 쪼개지지 않도록 묶은 버전 (제안)
LANDCOVER_GROUPS: dict[int, str] = {
    1: "forest", 2: "forest", 3: "forest", 4: "forest", 5: "forest",
    8: "savanna", 9: "savanna",
    6: "grass_shrub", 7: "grass_shrub", 10: "grass_shrub",
    12: "cropland", 14: "cropland",
    0: "other", 11: "other", 13: "other", 15: "other", 16: "other",
}


def landcover_path(res: float = 0.5) -> Path:
    """scripts/build_landcover.py 결과 위치: data/processed/landcover_0.5.parquet"""
    return PROCESSED / f"landcover_{res:g}.parquet"


# ---------------------------------------------------------------- 읽기
def list_layers(path: str | Path) -> list[str]:
    """HDF4 파일 안의 층 이름 목록 (층 이름이 맞는지 확인할 때)."""
    path = Path(path)
    if path.suffix.lower() in {".hdf", ".h4", ".hdf4"}:
        from pyhdf.SD import SD, SDC  # pip install pyhdf
        return list(SD(str(path), SDC.READ).datasets().keys())
    return [path.stem]


def read_mcd12c1(path: str | Path, layer: str = DEFAULT_LAYER) -> np.ndarray:
    """MCD12C1 IGBP 층을 (3600, 7200) uint8 배열로 읽는다. 0행 = 북위 90°, 0열 = 서경 180°.

    - .hdf: pyhdf (`pip install pyhdf`). pyhdf가 없으면 HDF4 드라이버가 있는 GDAL(rasterio)로 시도.
      Mac에서 HDF4 읽기가 번거로우면 AppEEARS에서 GeoTIFF로 받아 .tif로 넘긴다.
    - .tif: rasterio (`pip install rasterio`). 전 지구 0.05° 격자(왼쪽 위가 -180, 90)인지 확인한다.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in {".hdf", ".h4", ".hdf4"}:
        arr = _read_hdf(path, layer)
    elif suffix in {".tif", ".tiff"}:
        arr = _read_tif(path)
    else:
        raise ValueError(f"지원하지 않는 형식: {path.suffix} (.hdf 또는 .tif)")
    expected = (int(round(180 / SRC_RES)), int(round(360 / SRC_RES)))
    if arr.shape != expected:
        raise ValueError(f"전 지구 0.05° 격자가 아닙니다: shape={arr.shape}, 기대값={expected}")
    return arr.astype(np.uint8, copy=False)


def _read_hdf(path: Path, layer: str) -> np.ndarray:
    try:
        from pyhdf.SD import SD, SDC
    except ImportError:
        # GDAL built with HDF4 (e.g. conda's gdal) also works; pip's rasterio wheels do not have it.
        try:
            import rasterio
            with rasterio.open(path) as src:
                subs = [s for s in src.subdatasets if s.endswith(":" + layer)]
        except Exception as e:  # noqa: BLE001
            raise ImportError("HDF4를 읽으려면 `.venv/bin/pip install pyhdf` 를 설치하거나, "
                              "AppEEARS에서 GeoTIFF로 받아 .tif를 넘기세요.") from e
        if not subs:
            raise KeyError(f"층 {layer!r}이 없습니다. list_layers()로 이름을 확인하세요.")
        with rasterio.open(subs[0]) as src:
            return src.read(1)
    sd = SD(str(path), SDC.READ)
    if layer not in sd.datasets():
        raise KeyError(f"층 {layer!r}이 없습니다. 있는 층: {list(sd.datasets())}")
    return sd.select(layer)[:]


def _read_tif(path: Path) -> np.ndarray:
    import rasterio
    with rasterio.open(path) as src:
        t = src.transform
        if not (np.isclose(t.c, -180, atol=1e-6) and np.isclose(t.f, 90, atol=1e-6)
                and np.isclose(t.a, SRC_RES, atol=1e-9) and np.isclose(t.e, -SRC_RES, atol=1e-9)):
            raise ValueError(f"전 지구 0.05° WGS84 GeoTIFF가 아닙니다: transform={t}")
        return src.read(1)


# ---------------------------------------------------------------- 묶기
def majority_to_grid(arr: np.ndarray, res: float = 0.5) -> pd.DataFrame:
    """0.05° IGBP 배열 → (row, col, landcover) 표. 모든 칸이 한 줄씩 나온다."""
    k = int(round(res / SRC_RES))
    if not np.isclose(k * SRC_RES, res):
        raise ValueError(f"res는 {SRC_RES}의 정수배여야 합니다: {res}")
    h, w = arr.shape
    if h % k or w % k:
        raise ValueError(f"배열 크기 {arr.shape}가 {k}로 나누어떨어지지 않습니다.")
    nr, nc = h // k, w // k
    blocks = arr.reshape(nr, k, nc, k)

    # 물이 아닌 클래스(1..16)별 화소 수 → 가장 많은 클래스
    counts = np.zeros((N_CLASSES, nr, nc), dtype=np.int32)
    for code in range(1, N_CLASSES):
        if code in WATER_CODES:
            continue
        counts[code] = (blocks == code).sum(axis=(1, 3))
    has_land = counts.sum(axis=0) > 0
    landcover = np.where(has_land, counts.argmax(axis=0), 0).astype(np.int16)

    rows, cols = np.meshgrid(np.arange(nr), np.arange(nc), indexing="ij")
    return pd.DataFrame({
        "row": rows.ravel().astype(np.int32),
        "col": cols.ravel().astype(np.int32),
        "landcover": landcover.ravel(),
    })


def add_landcover_group(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["landcover_group"] = out["landcover"].map(LANDCOVER_GROUPS).astype("string")
    return out


# ---------------------------------------------------------------- 붙이기
def attach_landcover(grid: pd.DataFrame, path=None) -> pd.DataFrame:
    """격자 표에 `landcover`(정수 IGBP 코드)와 `landcover_group` 열을 붙인다.

    path: scripts/build_landcover.py가 만든 landcover_0.5.parquet (row, col, landcover).
          생략하면 landcover_path(0.5). 격자 해상도와 같은 해상도로 만든 파일이어야 한다.
    행 수와 순서는 그대로 두고, 없는 칸은 <NA>. 이미 열이 있으면 새 값으로 바꾼다.
    """
    lc = pd.read_parquet(path or landcover_path(), columns=["row", "col", "landcover"])
    if lc.duplicated(["row", "col"]).any():
        raise ValueError("토지 피복 표에 같은 (row, col)이 두 번 이상 있습니다.")
    base = grid.drop(columns=["landcover", "landcover_group"], errors="ignore")
    key = base[["row", "col"]].astype("int64")
    lc = lc.astype({"row": "int64", "col": "int64"})
    merged = key.merge(lc, on=["row", "col"], how="left", validate="many_to_one")
    out = base.copy()
    out["landcover"] = pd.array(merged["landcover"].to_numpy(), dtype="Int16")
    out["landcover_group"] = out["landcover"].map(LANDCOVER_GROUPS).astype("string")
    return out
