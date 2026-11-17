"""Hourly consumption forecasting with scikit-learn.

Features only use information available at forecast time for a horizon of up
to 24 h: calendar features, the value 24 h earlier, 168 h earlier and the mean
of the same hour over the previous 7 days. No future leakage.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

FEATURES = ["hour_sin", "hour_cos", "dow", "is_weekend", "lag_24", "lag_168", "same_hour_mean_7d"]
MAX_HORIZON = 24


def _calendar(ts: pd.Series) -> pd.DataFrame:
    hour = ts.dt.hour
    return pd.DataFrame({
        "hour_sin": np.sin(2 * np.pi * hour / 24),
        "hour_cos": np.cos(2 * np.pi * hour / 24),
        "dow": ts.dt.dayofweek,
        "is_weekend": (ts.dt.dayofweek >= 5).astype(int),
    })


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return df plus feature columns. Rows lacking history contain NaN."""
    out = df.copy().reset_index(drop=True)
    out = pd.concat([out, _calendar(out["ts"])], axis=1)
    p = out["power_kw"]
    out["lag_24"] = p.shift(24)
    out["lag_168"] = p.shift(168)
    out["same_hour_mean_7d"] = sum(p.shift(24 * k) for k in range(1, 8)) / 7
    return out


def _model() -> GradientBoostingRegressor:
    return GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=0.08, random_state=0)


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mask = y_true > 0.05  # avoid blowing up MAPE on near-zero values
    mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100) if mask.any() else None
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mape_pct": mape,
        "r2": float(r2_score(y_true, y_pred)),
    }


def evaluate(df: pd.DataFrame, test_days: int = 7) -> dict:
    """Chronological hold-out: train on the past, test on the last `test_days`.

    Compared against the seasonal-naive baseline (value 24 h earlier).
    """
    feats = build_features(df).dropna(subset=FEATURES).reset_index(drop=True)
    n_test = test_days * 24
    if len(feats) <= n_test + 24 * 7:
        raise ValueError("not enough data for evaluation")
    train, test = feats.iloc[:-n_test], feats.iloc[-n_test:]
    model = _model().fit(train[FEATURES], train["power_kw"])
    pred = model.predict(test[FEATURES])
    y = test["power_kw"].to_numpy()
    return {
        "model": "GradientBoostingRegressor",
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "test_period": {"from": test["ts"].iloc[0].isoformat(), "to": test["ts"].iloc[-1].isoformat()},
        "metrics": _metrics(y, pred),
        "baseline": {"name": "seasonal naive (same hour yesterday)", "metrics": _metrics(y, test["lag_24"].to_numpy())},
    }


def forecast(df: pd.DataFrame, horizon: int = 24) -> dict:
    """Train on all data and predict the next `horizon` hours (max 24)."""
    if not 1 <= horizon <= MAX_HORIZON:
        raise ValueError(f"horizon must be between 1 and {MAX_HORIZON}")
    feats = build_features(df).dropna(subset=FEATURES)
    model = _model().fit(feats[FEATURES], feats["power_kw"])
    last = df["ts"].iloc[-1]
    future_ts = pd.date_range(last + pd.Timedelta(hours=1), periods=horizon, freq="h")
    p = df.set_index("ts")["power_kw"]
    rows = []
    for t in future_ts:
        lag24 = p.get(t - pd.Timedelta(hours=24), np.nan)
        lag168 = p.get(t - pd.Timedelta(hours=168), np.nan)
        # lag_24 may be beyond history for h>24 only; horizon<=24 keeps it known.
        same = np.nanmean([p.get(t - pd.Timedelta(hours=24 * k), np.nan) for k in range(1, 8)])
        rows.append({"ts": t, **_calendar(pd.Series([t])).iloc[0].to_dict(),
                     "lag_24": lag24, "lag_168": lag168, "same_hour_mean_7d": same})
    X = pd.DataFrame(rows)
    X["lag_168"] = X["lag_168"].fillna(X["same_hour_mean_7d"])
    pred = np.clip(model.predict(X[FEATURES]), 0, None)
    return {
        "horizon_hours": horizon,
        "predictions": [{"ts": t.isoformat(), "power_kw": float(v)} for t, v in zip(future_ts, pred)],
        "predicted_energy_kwh": float(pred.sum()),  # hourly kW * 1 h = kWh
    }
