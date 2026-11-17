"""Anomaly detection with Isolation Forest.

An anomaly is a WARNING that a reading differs from the usual pattern. It is
not proof of a fault or of electricity theft.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .data import generate_synthetic


def _expected_by_hour(df: pd.DataFrame) -> pd.Series:
    """Median power for each hour of day (robust to the anomalies themselves)."""
    return df.groupby(df["ts"].dt.hour)["power_kw"].median()


def _features(df: pd.DataFrame, expected: pd.Series) -> pd.DataFrame:
    hour = df["ts"].dt.hour
    exp = hour.map(expected).astype(float)
    ratio = df["power_kw"] / exp.clip(lower=0.05)
    return pd.DataFrame({
        "power_kw": df["power_kw"],
        "ratio": ratio,
        "hour_sin": np.sin(2 * np.pi * hour / 24),
        "hour_cos": np.cos(2 * np.pi * hour / 24),
    }), exp


def severity_from_ratio(ratio: float) -> str:
    if ratio >= 2.5 or ratio <= 0.2:
        return "high"
    if ratio >= 1.8 or ratio <= 0.4:
        return "medium"
    return "low"


def detect(df: pd.DataFrame, contamination: float = 0.01, min_ratio_dev: float = 0.5) -> list[dict]:
    """Return flagged readings, newest first.

    Isolation Forest proposes outliers; we then require the reading to deviate
    at least `min_ratio_dev` (50%) from the usual value for that hour so tiny
    statistical oddities do not generate noise.
    """
    if not 0 < contamination <= 0.1:
        raise ValueError("contamination must be in (0, 0.1]")
    expected = _expected_by_hour(df)
    X, exp = _features(df, expected)
    forest = IsolationForest(n_estimators=200, contamination=contamination, random_state=0)
    labels = forest.fit_predict(X)
    scores = -forest.score_samples(X)  # higher = more unusual
    out = []
    observed = df["observed"].to_numpy() if "observed" in df else np.ones(len(df), dtype=bool)
    for i in np.where(labels == -1)[0]:
        if not observed[i]:
            continue  # never raise alerts for gap-filled (interpolated) hours
        ratio = float(X["ratio"].iloc[i])
        if abs(ratio - 1) < min_ratio_dev:
            continue
        direction = "higher" if ratio > 1 else "lower"
        ts = df["ts"].iloc[i]
        sev = severity_from_ratio(ratio)
        out.append({
            "ts": ts.isoformat(),
            "power_kw": float(df["power_kw"].iloc[i]),
            "expected_kw": float(exp.iloc[i]),
            "ratio": ratio,
            "score": float(scores[i]),
            "severity": sev,
            "direction": direction,
            "explanation": (
                f"Reading was {abs(ratio - 1) * 100:.0f}% {direction} than the usual "
                f"{float(exp.iloc[i]):.2f} kW for {ts.hour:02d}:00. Possible causes: a heavy appliance "
                "left on, a new load, a faulty reading or a power-quality event. "
                "This is a warning, not proof of electricity theft."),
        })
    out.sort(key=lambda r: r["ts"], reverse=True)
    return out


def self_check(contamination: float = 0.01, seed: int = 7) -> dict:
    """Measure the detector on SYNTHETIC data where injected anomalies are known."""
    df = generate_synthetic(days=60, seed=seed, anomaly_count=12)
    found = {a["ts"] for a in detect(df[["ts", "power_kw"]], contamination=contamination)}
    truth = {t.isoformat() for t in df.loc[df["is_injected_anomaly"], "ts"]}
    tp = len(found & truth)
    return {
        "dataset": "synthetic (60 days, 12 injected spikes)",
        "injected": len(truth), "flagged": len(found), "true_positives": tp,
        "precision": tp / len(found) if found else None,
        "recall": tp / len(truth),
        "note": "Measured on simulated data only; real-world performance is unknown.",
    }
