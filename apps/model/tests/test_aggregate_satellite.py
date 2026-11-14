"""MODIS Terra/Aqua 분리 열 확인.  실행: .venv/bin/python -m pytest tests -q"""
import warnings

import pandas as pd

from fsml.aggregate import build_grid

COLS = "latitude,longitude,acq_date,satellite,frp,daynight,type\n"


def _write(path, rows):
    path.write_text(COLS + "\n".join(rows) + "\n")
    return path


def test_terra_aqua_split_and_null_rule(tmp_path):
    modis = _write(tmp_path / "m.csv", [
        "10.1,20.1,2010-03-05,T,5,D,0",
        "10.1,20.1,2010-03-06,Terra,5,D,0",
        "10.1,20.1,2010-03-07,A,5,N,0",
        "10.1,20.1,2010-03-08,Aqua,5,D,0",
        "10.1,20.1,2010-03-08,A,5,D,1",       # 화산: 빠짐
        "-5.2,30.3,2013-07-01,A,9,D,0",
    ])
    viirs = _write(tmp_path / "v.csv", [
        "10.1,20.1,2013-01-02,N,3,D,0",
        "-5.2,30.3,2013-07-02,N,3,D,0",
    ])
    df = build_grid([modis], [viirs], res=0.5, period="month")
    a = df[pd.to_datetime(df.period) == "2010-03-01"].iloc[0]
    assert (a.modis_n, a.modis_n_terra, a.modis_n_aqua) == (4, 2, 2)
    assert pd.isna(a.viirs_n)                     # VIIRS 운영 전
    assert "viirs_n_terra" not in df.columns
    ok = df.modis_n.notna()
    assert ((df.modis_n_terra.fillna(0) + df.modis_n_aqua.fillna(0))[ok] == df.modis_n[ok]).all()
    # MODIS 운영 기간 안이지만 MODIS 탐지가 없는 칸-달 → 0 (NULL 아님)
    b = df[df.viirs_n.notna() & (df.modis_n == 0)]
    assert len(b) and (b.modis_n_aqua == 0).all() and (b.modis_n_terra == 0).all()


def test_unknown_satellite_warns(tmp_path):
    modis = _write(tmp_path / "m.csv", ["10.1,20.1,2013-01-05,X,5,D,0", "10.1,20.1,2013-01-05,T,5,D,0"])
    viirs = _write(tmp_path / "v.csv", ["10.1,20.1,2013-01-02,N,3,D,0"])
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        df = build_grid([modis], [viirs], res=0.5, period="month")
    assert any("satellite" in str(x.message) for x in w)
    assert df.modis_n.iloc[0] == 2 and df.modis_n_terra.iloc[0] == 1
    assert pd.isna(df.modis_n_aqua.iloc[0])  # Aqua 탐지가 하나도 없으면 운영 기간도 없음 → NULL


def test_no_satellite_column_still_works(tmp_path):
    m = tmp_path / "m.csv"; m.write_text("latitude,longitude,acq_date,frp,daynight\n10.1,20.1,2013-01-05,5,D\n")
    v = tmp_path / "v.csv"; v.write_text("latitude,longitude,acq_date,frp,daynight\n10.1,20.1,2013-01-02,3,D\n")
    df = build_grid([m], [v], res=0.5, period="month")
    assert "modis_n_terra" not in df.columns and df.modis_n.iloc[0] == 1


def test_aqua_null_before_its_first_detection(tmp_path):
    # Terra만 있던 시기(2001) → Aqua 열은 NULL, Terra 열은 0 이상
    modis = _write(tmp_path / "m.csv", [
        "10.1,20.1,2001-03-05,T,5,D,0",
        "40.1,20.1,2001-05-05,T,5,D,0",
        "10.1,20.1,2003-03-05,A,5,D,0",
        "10.1,20.1,2003-03-05,T,5,D,0",
    ])
    viirs = _write(tmp_path / "v.csv", ["10.1,20.1,2013-01-02,N,3,D,0"])
    df = build_grid([modis], [viirs], res=0.5, period="month")
    early = df[pd.to_datetime(df.period).dt.year == 2001]
    assert early.modis_n_aqua.isna().all() and early.modis_n_terra.notna().all()
    late = df[pd.to_datetime(df.period) == "2003-03-01"].iloc[0]
    assert (late.modis_n, late.modis_n_terra, late.modis_n_aqua) == (2, 1, 1)
    # 2013-01: MODIS 마지막 탐지(2003-03) 이후라 MODIS 운영 기간 밖 → 모두 NULL
    v = df[pd.to_datetime(df.period) == "2013-01-01"].iloc[0]
    assert pd.isna(v.modis_n) and pd.isna(v.modis_n_aqua) and pd.isna(v.modis_n_terra)
