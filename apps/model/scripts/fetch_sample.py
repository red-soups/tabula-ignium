"""Download the last 7 days of FIRMS MODIS + VIIRS (NOAA-20) and build a small sample grid.

Seven days cannot teach seasonal behaviour, but it is enough to run every notebook end
to end while the multi-year archive request is being processed.

VIIRS comes from NOAA-20: Suomi NPP's near-real-time file has been empty since 2026-11-12, and
notebook 09 shows the NPP-trained model works unchanged on NOAA-20 input.

    python scripts/fetch_sample.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fsml.aggregate import build_grid  # noqa: E402
from fsml.paths import RAW, grid_path  # noqa: E402

BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"
FILES = {
    "modis_7d.csv": f"{BASE}/modis-c6.1/csv/MODIS_C6_1_Global_7d.csv",
    "viirs_noaa20_7d.csv": f"{BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv",
}


def main() -> None:
    out_dir = RAW / "sample"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        dest = out_dir / name
        print(f"download {name} …")
        # curl uses the system trust store, which avoids Python certificate issues on macOS.
        subprocess.run(["curl", "-sfL", "--retry", "3", "-o", str(dest), url], check=True)
        size = dest.stat().st_size
        print(f"  {size / 1e6:.1f} MB")
        if size < 1000:
            sys.exit(f"{name} is empty: FIRMS may have stopped publishing {url}")

    out = grid_path(0.5, "day", "_sample")
    df = build_grid([out_dir / "modis_7d.csv"], [out_dir / "viirs_noaa20_7d.csv"],
                    res=0.5, period="day", out=out)
    print(f"grid: {len(df):,} cell-days → {out}")


if __name__ == "__main__":
    main()
