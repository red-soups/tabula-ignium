"""Train/validation/test splits that test what matters: unseen years and unseen places."""
from __future__ import annotations

import numpy as np
import pandas as pd


def time_split(df: pd.DataFrame, valid_years=None, test_years=None):
    """By default the last two years are the test set and the year before them validation,
    so no later year ever ends up in training."""
    year = pd.to_datetime(df["period"]).dt.year
    years = sorted(year.unique())
    test_years = years[-2:] if test_years is None else test_years
    valid_years = years[-3:-2] if valid_years is None else valid_years
    test = year.isin(test_years)
    valid = year.isin(valid_years)
    train = ~(test | valid)
    return train.to_numpy(), valid.to_numpy(), test.to_numpy()


def block_id(df: pd.DataFrame, block_deg: float = 10) -> pd.Series:
    return (np.floor((df["lat"] + 90) / block_deg).astype(int) * 1000 +
            np.floor((df["lon"] + 180) / block_deg).astype(int))


def spatial_split(df: pd.DataFrame, valid_frac=0.15, test_frac=0.15, block_deg: float = 10, seed: int = 0):
    """Hold out whole lat/lon blocks so neighbouring cells cannot leak between sets."""
    blocks = block_id(df, block_deg)
    uniq = blocks.unique()
    rng = np.random.default_rng(seed)
    rng.shuffle(uniq)
    n_test = max(1, int(len(uniq) * test_frac))
    n_valid = max(1, int(len(uniq) * valid_frac))
    test = blocks.isin(uniq[:n_test])
    valid = blocks.isin(uniq[n_test:n_test + n_valid])
    train = ~(test | valid)
    return train.to_numpy(), valid.to_numpy(), test.to_numpy()


def auto_split(df: pd.DataFrame):
    """Time split when there are enough years (the real archive), else spatial (the sample)."""
    years = pd.to_datetime(df["period"]).dt.year.nunique()
    if years >= 4:
        return "time", time_split(df)
    return "spatial", spatial_split(df)


def spatial_folds(df: pd.DataFrame, n_folds: int = 5, block_deg: float = 10, seed: int = 0):
    """K-fold over whole lat/lon blocks. Fold k is the test set, fold k+1 the validation set."""
    blocks = block_id(df, block_deg)
    uniq = blocks.unique()
    np.random.default_rng(seed).shuffle(uniq)
    fold_of = pd.Series(np.arange(len(uniq)) % n_folds, index=uniq)
    fold = blocks.map(fold_of).to_numpy()
    for k in range(n_folds):
        test = fold == k
        valid = fold == (k + 1) % n_folds
        yield ~(test | valid), valid, test


def time_folds(df: pd.DataFrame, test_years):
    """Forward chaining: predict year y from years before y-1, validating on y-1."""
    year = pd.to_datetime(df["period"]).dt.year.to_numpy()
    for y in test_years:
        yield year < y - 1, year == y - 1, year == y


def auto_folds(df: pd.DataFrame, n: int = 5):
    """Time folds over the last `n` years when the archive is long enough, else spatial folds."""
    years = sorted(pd.to_datetime(df["period"]).dt.year.unique())
    if len(years) >= n + 3:
        return "time", list(time_folds(df, years[-n:]))
    return "spatial", list(spatial_folds(df, n))
