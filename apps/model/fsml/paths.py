from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # apps/model/
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
MODELS = ROOT / "models"
EXPORTS = ROOT / "exports"


def grid_path(res: float, period: str, suffix: str = "") -> Path:
    return PROCESSED / f"grid_{res}_{period}{suffix}.parquet"


def default_grid() -> Path:
    """The full archive grid if it has been built, otherwise the 7-day sample grid."""
    full = grid_path(0.5, "month")
    if full.exists():
        return full
    sample = grid_path(0.5, "day", "_sample")
    if sample.exists():
        return sample
    raise FileNotFoundError(
        "No grid table yet. Run `python scripts/fetch_sample.py` for a quick sample, "
        "or aggregate the FIRMS archive with `python scripts/aggregate.py` (see apps/model/README.md)."
    )
