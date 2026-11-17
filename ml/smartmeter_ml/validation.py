"""Input validation shared by the service and the model functions."""
from __future__ import annotations

import numpy as np
import pandas as pd

MIN_ROWS_FORECAST = 24 * 21  # three weeks of hourly data
MIN_ROWS_ANOMALY = 24 * 7
MAX_GAP_HOURS = 24


class InputError(ValueError):
    """Raised when request data is unusable. Safe to show to the caller."""


def readings_to_frame(rows: list[dict], min_rows: int) -> pd.DataFrame:
    if not isinstance(rows, list) or not rows:
        raise InputError("'readings' must be a non-empty list")
    if len(rows) > 50_000:
        raise InputError("too many readings (max 50000)")
    try:
        df = pd.DataFrame(rows)
        df["ts"] = pd.to_datetime(df["ts"], utc=True, errors="raise")
        df["power_kw"] = pd.to_numeric(df["power_kw"], errors="raise")
    except (KeyError, ValueError, TypeError) as exc:
        raise InputError("each reading needs a valid 'ts' (ISO time) and numeric 'power_kw'") from exc
    if df["power_kw"].isna().any() or (df["power_kw"] < 0).any():
        raise InputError("power_kw must be a non-negative number")
    df = df.sort_values("ts").drop_duplicates("ts").reset_index(drop=True)
    # Regular hourly grid. Gaps of up to MAX_GAP_HOURS (e.g. a short device outage) are
    # linearly interpolated; after a longer gap only the latest contiguous run is used,
    # so the models never see NaN values or fabricated long stretches.
    grid = df.set_index("ts")[["power_kw"]].resample("h").mean()
    grid["observed"] = grid["power_kw"].notna()  # False for gap-filled hours
    grid["power_kw"] = grid["power_kw"].interpolate(limit=MAX_GAP_HOURS)
    nan_pos = np.flatnonzero(grid["power_kw"].isna().to_numpy())
    if len(nan_pos):
        grid = grid.iloc[nan_pos[-1] + 1:]
    df = grid.reset_index()
    if len(df) < min_rows:
        raise InputError(f"need at least {min_rows} contiguous hourly readings, got {len(df)}")
    return df
