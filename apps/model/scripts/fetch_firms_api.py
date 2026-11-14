"""FIRMS Area API로 최근 데이터(예: 2026-01 ~ 오늘)를 받아 aggregate.py가 읽는 CSV로 저장한다.

국가별 연도 파일은 2025년까지만 있어서, 그 뒤 기간은 API로 채운다. apps/model 에서 실행:

    export FIRMS_MAP_KEY=...   # https://firms.modaps.eosdis.nasa.gov/api/map_key/ 에서 이메일로 받는 무료 키
    .venv/bin/python scripts/fetch_firms_api.py --start 2026-01-01 --end 2026-11-30
    .venv/bin/python scripts/aggregate.py --modis "data/raw/api/modis/**/*.csv" \\
        --viirs "data/raw/api/viirs_noaa20/**/*.csv" --res 0.5 --period month \\
        --out data/processed/grid_0.5_month_2026.parquet

하는 일
1. /api/data_availability/ 로 위성별 확정(SP)·실시간(NRT) 데이터가 있는 날짜를 확인한다.
   하루는 SP와 NRT 중 하나만 받는다 (SP가 있으면 SP, 없으면 NRT). 두 개를 다 받으면 같은 불이 두 번 세어진다.
2. 전 세계(world)를 5일씩(API 한도) 받는다. 응답이 CSV가 아니면(한도 초과 등) 기다렸다가 다시 시도한다.
3. NRT 파일에는 `type` 열이 없다. 그대로 SP와 섞으면 aggregate.py의 `type = 0` 필터에서 NRT 행이
   전부 빠지므로, 같은 기간 SP에서 고정 열원(type 1 화산, 2 기타 고정 열원, 3 해상) 위치를
   약 1 km 칸(0.01°)으로 모아 두고, NRT 탐지가 그 칸에 있으면 그 type을, 아니면 0을 넣는다.
   이렇게 채운 행은 `type_inferred = 1` 이다.

키는 환경 변수로만 받고, 화면·파일 어디에도 남기지 않는다.
"""
from __future__ import annotations

import argparse
import io
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fsml.paths import RAW  # noqa: E402

API = "https://firms.modaps.eosdis.nasa.gov/api"
MAX_DAYS = 5                  # Area API DAY_RANGE 한도 (1~5)
STATIC_CELL = 0.01            # 고정 열원 위치를 맞출 칸 크기 (도). 약 1 km
SENSORS = {
    # 폴더 이름: (SP 소스, NRT 소스)
    "modis": ("MODIS_SP", "MODIS_NRT"),
    "viirs_noaa20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
}
CSV_HEADER = "latitude,longitude"


@dataclass(frozen=True)
class Request:
    sensor: str
    source: str
    start: date
    days: int

    @property
    def kind(self) -> str:
        return "SP" if self.source.endswith("_SP") else "NRT"

    def filename(self) -> str:
        return f"{self.source}_{self.start:%Y-%m-%d}_{self.days}d.csv"


# ---------------------------------------------------------------- 계획
def plan(sensor: str, start: date, end: date, sp_max: date | None, nrt_range: tuple[date, date] | None
         ) -> list[Request]:
    """start~end(양 끝 포함)를 SP 구간과 NRT 구간으로 나누고 5일씩 자른다. 받을 수 없는 날은 건너뛴다."""
    sp_src, nrt_src = SENSORS[sensor]
    out: list[Request] = []

    def chunks(src: str, a: date, b: date) -> None:
        d = a
        while d <= b:
            n = min(MAX_DAYS, (b - d).days + 1)
            out.append(Request(sensor, src, d, n))
            d += timedelta(days=n)

    sp_end = min(end, sp_max) if sp_max else None
    if sp_end and sp_end >= start:
        chunks(sp_src, start, sp_end)
    nrt_start = max(start, sp_end + timedelta(days=1)) if sp_end and sp_end >= start else start
    if nrt_range:
        a, b = max(nrt_start, nrt_range[0]), min(end, nrt_range[1])
        if a <= b:
            chunks(nrt_src, a, b)
    return out


def missing_days(reqs: list[Request], start: date, end: date) -> list[date]:
    covered = {r.start + timedelta(days=i) for r in reqs for i in range(r.days)}
    return [start + timedelta(days=i) for i in range((end - start).days + 1)
            if start + timedelta(days=i) not in covered]


# ---------------------------------------------------------------- 받기
class FetchError(Exception):
    pass


def _get(url: str, timeout: float = 300) -> str:
    # curl uses the system trust store, which avoids Python certificate issues on macOS (fetch_sample.py와 같음).
    r = subprocess.run(["curl", "-sL", "--max-time", str(int(timeout)), url],
                       capture_output=True, text=True, errors="replace")
    if r.returncode != 0:
        raise FetchError(f"curl exit {r.returncode}")
    return r.stdout


def availability(key: str, get=_get) -> dict[str, tuple[date, date]]:
    """{소스 이름: (첫 날짜, 마지막 날짜)}"""
    text = get(f"{API}/data_availability/csv/{key}/ALL")
    df = pd.read_csv(io.StringIO(text))
    return {r.data_id: (date.fromisoformat(str(r.min_date)), date.fromisoformat(str(r.max_date)))
            for r in df.itertuples()}


def fetch(req: Request, key: str, get=_get, retries: int = 5, wait: float = 60.0, log=print) -> str:
    """CSV 본문을 돌려준다. 응답이 CSV가 아니면(한도 초과, 오류 문구) 기다렸다가 다시 시도한다."""
    url = f"{API}/area/csv/{key}/{req.source}/world/{req.days}/{req.start:%Y-%m-%d}"
    last = ""
    for attempt in range(1, retries + 1):
        try:
            text = get(url)
        except (FetchError, TimeoutError, ConnectionError) as e:
            last = f"{type(e).__name__}: {e}"
        else:
            if text.startswith(CSV_HEADER):
                return text
            last = text.strip().splitlines()[0][:200] if text.strip() else "(빈 응답)"
        log(f"  {req.filename()}: 다시 시도 {attempt}/{retries} ({last.replace(key, '***')})")
        time.sleep(wait * attempt)
    raise RuntimeError(f"{req.filename()} 실패: {last.replace(key, '***')}")


# ---------------------------------------------------------------- NRT type 채우기
def _cell(lat: pd.Series, lon: pd.Series) -> pd.Series:
    return (np.floor(lat / STATIC_CELL).astype(np.int64) * 100_000
            + np.floor((lon + 180) / STATIC_CELL).astype(np.int64))


def static_sources(sp_frames: list[pd.DataFrame]) -> pd.Series:
    """SP 탐지에서 고정 열원 칸 → type (칸마다 가장 많이 나온 0 아닌 type)."""
    parts = [f[["latitude", "longitude", "type"]] for f in sp_frames if "type" in f and len(f)]
    if not parts:
        return pd.Series(dtype="int64")
    sp = pd.concat(parts)
    sp = sp[pd.to_numeric(sp["type"], errors="coerce").fillna(0).astype(int) != 0]
    if sp.empty:
        return pd.Series(dtype="int64")
    cell = _cell(sp["latitude"], sp["longitude"])
    return sp.assign(cell=cell.to_numpy()).groupby("cell")["type"].agg(lambda t: t.astype(int).mode().iloc[0])


def fill_type(nrt: pd.DataFrame, static: pd.Series) -> pd.DataFrame:
    out = nrt.copy()
    if "type_inferred" in out:          # 이어 받기: 이미 채운 파일
        return out
    if "type" in out and out["type"].notna().all():
        out["type_inferred"] = 0
        return out
    cell = _cell(out["latitude"], out["longitude"])
    out["type"] = cell.map(static).fillna(0).astype(int).to_numpy()
    out["type_inferred"] = 1
    return out


# ---------------------------------------------------------------- 실행
def run(start: date, end: date, out_dir: Path, key: str, sensors: list[str], get=_get,
        pause: float = 2.0, log=print) -> dict:
    avail = availability(key, get)
    summary = {}
    for sensor in sensors:
        sp_src, nrt_src = SENSORS[sensor]
        sp_max = avail.get(sp_src, (None, None))[1]
        reqs = plan(sensor, start, end, sp_max, avail.get(nrt_src))
        gaps = missing_days(reqs, start, end)
        log(f"[{sensor}] SP ~{sp_max}, NRT {avail.get(nrt_src)} → 요청 {len(reqs)}개"
            + (f", 받을 수 없는 날 {len(gaps)}일 ({gaps[0]}~{gaps[-1]})" if gaps else ""))

        sp_frames, nrt_reqs, rows = [], [], {"SP": 0, "NRT": 0}
        for r in reqs:
            path = out_dir / sensor / f"{r.start:%Y}" / r.filename()
            if path.exists() and path.stat().st_size > 0:   # 이어 받기
                df = pd.read_csv(path)
            else:
                df = pd.read_csv(io.StringIO(fetch(r, key, get, log=log)))
                if r.kind == "SP":
                    path.parent.mkdir(parents=True, exist_ok=True)
                    df.to_csv(path, index=False)
                time.sleep(pause)
            rows[r.kind] += len(df)
            if r.kind == "SP":
                sp_frames.append(df)
            else:
                nrt_reqs.append((r, path, df))

        static = static_sources(sp_frames)
        inferred_static = 0
        for r, path, df in nrt_reqs:
            df = fill_type(df, static) if len(df) else df.assign(type=pd.Series(dtype=int), type_inferred=1)
            inferred_static += int((df["type"] != 0).sum()) if len(df) else 0
            path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(path, index=False)
        summary[sensor] = {"sp_until": str(sp_max), "requests": len(reqs), "rows": rows,
                           "static_cells": int(len(static)), "nrt_marked_static": inferred_static,
                           "missing_days": [str(d) for d in gaps]}
        log(f"[{sensor}] SP {rows['SP']:,}행, NRT {rows['NRT']:,}행 "
            f"(고정 열원 칸 {len(static):,}개, NRT 중 고정 열원으로 표시 {inferred_static:,}행)")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", type=date.fromisoformat, default=date(2026, 1, 1))
    ap.add_argument("--end", type=date.fromisoformat, default=date.today())
    ap.add_argument("--out", type=Path, default=RAW / "api")
    ap.add_argument("--sensors", nargs="+", choices=list(SENSORS), default=list(SENSORS))
    ap.add_argument("--pause", type=float, default=2.0, help="요청 사이 쉬는 초 (한도: 키당 10분에 5,000건)")
    args = ap.parse_args()
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key:
        sys.exit("FIRMS_MAP_KEY 환경 변수에 키를 넣어 주세요: export FIRMS_MAP_KEY=...")
    t0 = time.time()
    s = run(args.start, args.end, args.out, key, args.sensors, pause=args.pause)
    print(f"끝 ({time.time() - t0:.0f}s) → {args.out}")
    for sensor, v in s.items():
        if v["missing_days"]:
            print(f"  주의: {sensor} {len(v['missing_days'])}일은 API에 데이터가 없어 받지 못했습니다.")


if __name__ == "__main__":
    main()
