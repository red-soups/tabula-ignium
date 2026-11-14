"""build_static_sources.py 확인 (작은 가짜 CSV).  실행: .venv/bin/python -m pytest tests -q"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_static_sources as B  # noqa: E402
import fetch_firms_api as F  # noqa: E402

HEAD = "latitude,longitude,acq_date,version,type,type_inferred,data_source\n"


def test_cells_types_min_count_and_nrt_ignored(tmp_path):
    rows = [
        "19.4213,-155.2871,2026-01-01,2,1,0,SP",      # 화산 2번 → 남음
        "19.4214,-155.2872,2026-01-02,2,1,0,SP",
        "29.0001,48.0001,2026-01-01,2,2,0,SP",        # 가스 플레어 1번 → min_count=2에서 빠짐
        "-10.1,25.1,2026-01-01,2,0,0,SP",             # 식생 화재 → 빠짐
        "40.0,50.0,2026-09-01,2NRT,2,1,NRT",          # NRT에 채운 type → 쓰지 않음
        "40.0,50.0,2026-09-02,2NRT,2,1,NRT",
    ]
    f = tmp_path / "x.csv"; f.write_text(HEAD + "\n".join(rows) + "\n")
    t = B.build([str(f)], min_count=2)
    assert t["n_cells"] == 1 and t["cells"]["1"] == [int(np.floor(19.4213 / 0.01)) * 100000
                                                    + int(np.floor((-155.2871 + 180) / 0.01))]
    assert B.build([str(f)], min_count=1)["n_cells"] == 2


def test_key_matches_fetch_firms_api():
    import pandas as pd
    lat, lon = pd.Series([19.4213, -23.28945]), pd.Series([-155.2871, -58.76951])
    assert B.RES == F.STATIC_CELL and B.KEY_MUL == 100_000
    expect = [int(np.floor(a / B.RES)) * B.KEY_MUL + int(np.floor((b + 180) / B.RES)) for a, b in zip(lat, lon)]
    assert F._cell(lat, lon).tolist() == expect


def test_cli_writes_json(tmp_path):
    f = tmp_path / "a.csv"
    f.write_text("latitude,longitude,acq_date,version,type\n1.0,2.0,2026-01-01,61.03,2\n1.0,2.0,2026-01-02,61.03,2\n")
    out = tmp_path / "s.json"
    subprocess.run([sys.executable, str(Path(B.__file__)), str(f), "--out", str(out)], check=True)
    assert json.loads(out.read_text())["cells"]["2"]
