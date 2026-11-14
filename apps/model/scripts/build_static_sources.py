"""고정 열원(화산·가스 플레어·공장·해상) 위치표를 만든다. 지구본의 실시간(NRT) 점에서 이것들을 거르는 데 쓴다.

FIRMS 실시간 파일(24h·48h·7d, API의 *_NRT)에는 `type` 열이 없어서, 가스 플레어나 공장도 '화재'로 찍힌다.
확정(SP) 데이터의 `type`(1 화산, 2 기타 고정 열원, 3 해상)으로 약 1 km(0.01°) 칸 위치표를 만들어 두고,
NRT 탐지가 그 칸에 떨어지면 거른다. fetch_firms_api.py가 NRT에 type을 채울 때와 같은 칸 규칙이다.

    # 국가별 연도 파일(SP)이나 fetch_firms_api.py로 받은 SP 파일 아무거나
    .venv/bin/python scripts/build_static_sources.py \\
        "data/raw/archive/viirs_snpp/2024/*.csv" "data/raw/archive/viirs_snpp/2025/*.csv" \\
        "data/raw/api/viirs_noaa20/2026/VIIRS_NOAA20_SP_*.csv" "data/raw/api/modis/2026/MODIS_SP_*.csv"

결과: data/processed/static_sources_0.01.json (웹에 그대로 올려도 되는 크기. 2026 SP 기준 약 2.5만 칸)

    {"res": 0.01, "key": "floor(lat/res) * 100000 + floor((lon + 180) / res)",
     "types": {"1": "volcano", "2": "static land source", "3": "offshore"},
     "cells": {"1": [key, ...], "2": [...], "3": [...]}}

웹 Worker에서는 `new Set(cells["1"].concat(cells["2"], cells["3"]))`로 만들어 두고, 각 탐지의 key가 들어 있으면 뺀다.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fsml.paths import PROCESSED  # noqa: E402

RES = 0.01          # fetch_firms_api.STATIC_CELL과 같아야 한다
KEY_MUL = 100_000   # fetch_firms_api._cell과 같은 키
TYPES = {1: "volcano", 2: "static land source", 3: "offshore"}


def build(files: list[str], min_count: int = 2) -> dict:
    """SP 탐지에서 0이 아닌 type이 min_count번 이상 나온 칸 → 그 칸에서 가장 많이 나온 type."""
    if not files:
        raise SystemExit("입력 CSV가 없습니다.")
    con = duckdb.connect()
    # 모두 글자로 읽고 쓰는 열만 변환한다. (version 열이 SP는 61.03, NRT는 6.1NRT처럼 섞여 있어 형식 추측이 깨짐)
    src = f"read_csv({files!r}, union_by_name = true, all_varchar = true)"
    cols = {c[0] for c in con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()}
    if "type" not in cols:
        raise SystemExit("입력에 type 열이 없습니다. 확정(SP) 파일을 넣어 주세요 (NRT에는 type이 없음).")
    where = ["TRY_CAST(type AS INTEGER) IN (1, 2, 3)"]
    if "type_inferred" in cols:          # fetch_firms_api가 NRT에 채운 type은 쓰지 않는다
        where.append("coalesce(TRY_CAST(type_inferred AS INTEGER), 0) = 0")
    if "data_source" in cols:
        where.append("coalesce(data_source, 'SP') = 'SP'")
    rows = con.execute(f"""
        SELECT CAST(floor(CAST(latitude AS DOUBLE) / {RES}) AS BIGINT) * {KEY_MUL}
             + CAST(floor((CAST(longitude AS DOUBLE) + 180) / {RES}) AS BIGINT) AS key,
               mode(TRY_CAST(type AS INTEGER)) AS t, count(*) AS n
        FROM {src} WHERE {' AND '.join(where)}
        GROUP BY 1 HAVING count(*) >= {min_count} ORDER BY 1
    """).fetchall()
    cells: dict[str, list[int]] = {str(t): [] for t in TYPES}
    for key, t, _ in rows:
        cells[str(t)].append(int(key))
    return {"res": RES, "key": f"floor(lat/res) * {KEY_MUL} + floor((lon + 180) / res)",
            "types": {str(k): v for k, v in TYPES.items()}, "min_count": min_count,
            "n_cells": len(rows), "cells": cells}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="SP CSV 경로나 패턴 (따옴표로 감싸기)")
    ap.add_argument("--min-count", type=int, default=2, help="고정 열원으로 볼 최소 탐지 수 (기본 2)")
    ap.add_argument("--out", type=Path, default=PROCESSED / "static_sources_0.01.json")
    args = ap.parse_args()
    files = sorted({f for p in args.inputs for f in glob.glob(p, recursive=True)})
    table = build(files, args.min_count)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(table, separators=(",", ":")))
    by_type = {TYPES[int(k)]: len(v) for k, v in table["cells"].items()}
    print(f"{len(files)} files → {table['n_cells']:,} cells {by_type} → {args.out} "
          f"({args.out.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
