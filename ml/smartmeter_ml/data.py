"""Synthetic smart-meter data generator.

All data produced here is SIMULATED. It is used for unit tests and for the
self-check of the anomaly detector (where we know which points were injected).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Typical household load shape in kW by hour of day.
_HOURLY_PROFILE = np.array(
    [0.30, 0.28, 0.27, 0.27, 0.30, 0.45, 0.80, 1.10, 1.10, 0.85, 0.70, 0.70,
     0.75, 0.80, 0.75, 0.70, 0.80, 1.10, 1.50, 2.00, 2.10, 1.90, 1.20, 0.60]
)


def generate_synthetic(
    days: int = 90,
    seed: int = 42,
    start: str | pd.Timestamp = "2026-01-01 00:00",
    anomaly_count: int = 0,
    anomaly_seed: int | None = None,
) -> pd.DataFrame:
    """Return an hourly DataFrame with columns ts, power_kw, is_injected_anomaly.

    Weekends use ~15% more load and there is a mild seasonal drift.
    `anomaly_count` spikes (2.5x to 4x normal) are injected at random hours.
    """
    if days < 1:
        raise ValueError("days must be >= 1")
    rng = np.random.default_rng(seed)
    ts = pd.date_range(start=start, periods=days * 24, freq="h")
    base = _HOURLY_PROFILE[ts.hour]
    weekend = np.where(ts.dayofweek >= 5, 1.15, 1.0)
    drift = 1.0 + 0.1 * np.sin(2 * np.pi * np.arange(len(ts)) / (24 * 60))
    noise = rng.normal(1.0, 0.08, len(ts))
    power = np.clip(base * weekend * drift * noise, 0.05, None)
    flag = np.zeros(len(ts), dtype=bool)
    if anomaly_count > 0:
        arng = np.random.default_rng(seed + 1 if anomaly_seed is None else anomaly_seed)
        idx = arng.choice(np.arange(24, len(ts)), size=anomaly_count, replace=False)
        power[idx] = power[idx] * arng.uniform(2.5, 4.0, size=anomaly_count) + 0.8
        flag[idx] = True
    return pd.DataFrame({"ts": ts, "power_kw": power, "is_injected_anomaly": flag})
