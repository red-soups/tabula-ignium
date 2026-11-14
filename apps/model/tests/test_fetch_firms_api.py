"""fetch_firms_api.py를 가짜 FIRMS 응답으로 확인 (네트워크 안 씀).  실행: .venv/bin/python -m pytest tests -q"""
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_firms_api as F  # noqa: E402

KEY = "SECRETKEY123"
AVAIL = ("data_id,min_date,max_date\n"
         "MODIS_SP,2000-11-01,2026-08-31\nMODIS_NRT,2026-08-01,2026-11-13\n"
         "VIIRS_NOAA20_SP,2018-04-01,2026-07-31\nVIIRS_NOAA20_NRT,2026-07-15,2026-11-13\n")
SP_COLS = "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,version,frp,daynight,type"
NRT_COLS = "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,version,frp,daynight"
VOLCANO = (19.4213, -155.2871)   # 고정 열원 (SP에서 type 1)


def fake_get(calls):
    def get(url):
        calls.append(url)
        if "/data_availability/" in url:
            return AVAIL
        m = re.search(r"/area/csv/[^/]+/(\w+)/world/(\d)/(\d{4}-\d\d-\d\d)", url)
        src, days, start = m.group(1), int(m.group(2)), date.fromisoformat(m.group(3))
        sat = "Aqua" if src.startswith("MODIS") else "N20"
        rows = []
        for i in range(days):
            d = start + timedelta(days=i)
            if src.endswith("_SP"):
                rows.append(f"-10.1,25.1,{d},1330,{sat},X,80,2,5,D,0")
                rows.append(f"{VOLCANO[0]},{VOLCANO[1]},{d},1330,{sat},X,80,2,50,D,1")
            else:
                rows.append(f"-10.1,25.1,{d},1330,{sat},X,80,2NRT,5,D")
                rows.append(f"{VOLCANO[0] + 0.001},{VOLCANO[1] + 0.002},{d},1330,{sat},X,80,2NRT,50,D")
        return "\n".join([SP_COLS if src.endswith("_SP") else NRT_COLS, *rows]) + "\n"
    return get


def test_plan_splits_sp_nrt_without_overlap_and_5_day_chunks():
    reqs = F.plan("viirs_noaa20", date(2026, 1, 1), date(2026, 11, 13), date(2026, 7, 31),
                  (date(2026, 7, 15), date(2026, 11, 13)))
    days = [r.start + timedelta(days=i) for r in reqs for i in range(r.days)]
    assert len(days) == len(set(days)) == (date(2026, 11, 13) - date(2026, 1, 1)).days + 1
    assert all(r.days <= 5 for r in reqs)
    assert max(r.start for r in reqs if r.kind == "SP") <= date(2026, 7, 31)
    assert min(r.start for r in reqs if r.kind == "NRT") == date(2026, 8, 1)


def test_plan_reports_gap_when_nrt_does_not_reach_back():
    reqs = F.plan("modis", date(2026, 1, 1), date(2026, 3, 31), date(2026, 1, 31),
                  (date(2026, 2, 10), date(2026, 3, 31)))
    gaps = F.missing_days(reqs, date(2026, 1, 1), date(2026, 3, 31))
    assert gaps[0] == date(2026, 2, 1) and gaps[-1] == date(2026, 2, 9)


def test_fetch_retries_on_non_csv_and_hides_key():
    answers = iter(["Invalid MAP_KEY " + KEY, "Exceeding allowed transaction limit", "latitude,longitude\n1,2\n"])
    logs = []
    text = F.fetch(F.Request("modis", "MODIS_NRT", date(2026, 1, 1), 5), KEY,
                   get=lambda url: next(answers), wait=0, log=logs.append)
    assert text.startswith("latitude")
    assert len(logs) == 2 and all(KEY not in l for l in logs)


def test_run_end_to_end_fills_nrt_type(tmp_path):
    calls = []
    s = F.run(date(2026, 7, 20), date(2026, 8, 10), tmp_path, KEY, ["modis", "viirs_noaa20"],
              get=fake_get(calls), pause=0, log=lambda *_: None)
    assert s["viirs_noaa20"]["missing_days"] == [] and s["modis"]["missing_days"] == []
    nrt = pd.concat(pd.read_csv(p) for p in (tmp_path / "viirs_noaa20").rglob("VIIRS_NOAA20_NRT_*.csv"))
    assert (nrt["type_inferred"] == 1).all()
    assert set(nrt["type"]) == {0, 1}                       # 화산 근처 탐지만 type 1
    assert (nrt.loc[nrt.latitude > 0, "type"] == 1).all()
    # 일수 확인: SP 7/20~7/31 (12일), NRT 8/1~8/10 (10일), 하루 2행
    sp = pd.concat(pd.read_csv(p) for p in (tmp_path / "viirs_noaa20").rglob("VIIRS_NOAA20_SP_*.csv"))
    assert len(sp) == 24 and len(nrt) == 20
    # 다시 실행하면 이미 받은 파일은 다시 요청하지 않음
    calls.clear()
    F.run(date(2026, 7, 20), date(2026, 8, 10), tmp_path, KEY, ["modis", "viirs_noaa20"],
          get=fake_get(calls), pause=0, log=lambda *_: None)
    assert all("/data_availability/" in c for c in calls)


def test_aggregate_keeps_nrt_rows(tmp_path):
    """aggregate.py(firescope와 같은 코드)로 집계해도 NRT 달이 0이 되지 않는다."""
    from fsml.aggregate import build_grid
    F.run(date(2026, 7, 20), date(2026, 8, 10), tmp_path, KEY, ["modis", "viirs_noaa20"],
          get=fake_get([]), pause=0, log=lambda *_: None)
    g = build_grid(list((tmp_path / "modis").rglob("*.csv")), list((tmp_path / "viirs_noaa20").rglob("*.csv")),
                   res=0.5, period="month")
    g["period"] = pd.to_datetime(g["period"])
    fire = g[(g.lat < 0)].set_index("period")
    assert fire.loc["2026-07-01", "viirs_n"] == 12 and fire.loc["2026-08-01", "viirs_n"] == 10   # NRT 8월 살아 있음
    assert fire.loc["2026-08-01", "modis_n"] == 10 and fire.loc["2026-08-01", "modis_n_aqua"] == 10
    assert (g[g.lat > 0]["viirs_n"].fillna(0) == 0).all()                     # 화산은 빠짐
