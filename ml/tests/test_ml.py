import numpy as np
import pandas as pd
import pytest

from smartmeter_ml import anomaly, forecast
from smartmeter_ml.data import generate_synthetic
from smartmeter_ml.service import create_app
from smartmeter_ml.validation import InputError, readings_to_frame


# ---------- data ----------
def test_synthetic_is_reproducible_and_positive():
    a = generate_synthetic(days=10, seed=1)
    b = generate_synthetic(days=10, seed=1)
    assert a.equals(b)
    assert len(a) == 240 and (a["power_kw"] > 0).all()


def test_synthetic_injects_requested_anomalies():
    df = generate_synthetic(days=30, seed=3, anomaly_count=5)
    assert df["is_injected_anomaly"].sum() == 5


def test_synthetic_rejects_bad_days():
    with pytest.raises(ValueError):
        generate_synthetic(days=0)


# ---------- validation ----------
def _rows(n=24 * 22):
    df = generate_synthetic(days=22)
    return [{"ts": t.isoformat() + "Z", "power_kw": float(p)} for t, p in zip(df["ts"], df["power_kw"])][:n]


def test_validation_accepts_good_data():
    df = readings_to_frame(_rows(), 24 * 21)
    assert len(df) >= 24 * 21


@pytest.mark.parametrize("bad", [None, [], "x", [{"ts": "nope", "power_kw": 1}], [{"ts": "2026-01-01T00:00:00Z", "power_kw": -1}]])
def test_validation_rejects_bad_data(bad):
    with pytest.raises(InputError):
        readings_to_frame(bad, 1)


def test_validation_rejects_too_few_rows():
    with pytest.raises(InputError):
        readings_to_frame(_rows(48), 24 * 21)


# ---------- forecast ----------
@pytest.fixture(scope="module")
def df():
    return generate_synthetic(days=60, seed=5)[["ts", "power_kw"]]


def test_features_have_no_future_leakage(df):
    f = forecast.build_features(df)
    i = 400
    assert f.loc[i, "lag_24"] == df.loc[i - 24, "power_kw"]
    assert f.loc[i, "lag_168"] == df.loc[i - 168, "power_kw"]
    assert f.loc[:23, "lag_24"].isna().all()


def test_forecast_shape_and_values(df):
    out = forecast.forecast(df, horizon=24)
    assert len(out["predictions"]) == 24
    vals = [p["power_kw"] for p in out["predictions"]]
    assert all(v >= 0 for v in vals)
    assert out["predicted_energy_kwh"] == pytest.approx(sum(vals))
    assert pd.Timestamp(out["predictions"][0]["ts"]) == df["ts"].iloc[-1] + pd.Timedelta(hours=1)


@pytest.mark.parametrize("h", [0, 25, -1])
def test_forecast_rejects_bad_horizon(df, h):
    with pytest.raises(ValueError):
        forecast.forecast(df, horizon=h)


def test_evaluate_returns_metrics_and_beats_nothing_by_assumption(df):
    ev = forecast.evaluate(df)
    for key in ("mae", "rmse", "r2"):
        assert np.isfinite(ev["metrics"][key])
        assert np.isfinite(ev["baseline"]["metrics"][key])
    assert ev["test_rows"] == 7 * 24
    # Print for the README; we do not assert that ML beats the baseline.
    print("EVAL", ev["metrics"], ev["baseline"]["metrics"])


# ---------- anomaly ----------
def test_severity_thresholds():
    assert anomaly.severity_from_ratio(3.0) == "high"
    assert anomaly.severity_from_ratio(2.0) == "medium"
    assert anomaly.severity_from_ratio(1.6) == "low"
    assert anomaly.severity_from_ratio(0.1) == "high"


def test_detect_finds_injected_spike():
    d = generate_synthetic(days=30, seed=9)[["ts", "power_kw"]].copy()
    d.loc[500, "power_kw"] = 6.0
    flagged = {a["ts"] for a in anomaly.detect(d)}
    assert d["ts"].iloc[500].isoformat() in flagged


def test_detect_quiet_data_has_few_flags():
    d = generate_synthetic(days=30, seed=11)[["ts", "power_kw"]]
    assert len(anomaly.detect(d)) <= 7  # at most ~1% contamination


def test_detect_explanation_mentions_not_theft_proof():
    d = generate_synthetic(days=30, seed=9)[["ts", "power_kw"]].copy()
    d.loc[500, "power_kw"] = 6.0
    a = anomaly.detect(d)[0]
    assert "not proof" in a["explanation"] and a["severity"] in {"low", "medium", "high"}


def test_detect_rejects_bad_contamination():
    d = generate_synthetic(days=10)[["ts", "power_kw"]]
    with pytest.raises(ValueError):
        anomaly.detect(d, contamination=0.5)


def test_self_check_reports_real_numbers():
    r = anomaly.self_check()
    assert r["injected"] == 12 and 0 <= r["recall"] <= 1
    print("SELFCHECK", r)


# ---------- service ----------
@pytest.fixture()
def client():
    return create_app().test_client()


def test_health(client):
    assert client.get("/health").json == {"status": "ok"}


def test_service_forecast_ok_and_bad(client):
    r = client.post("/forecast", json={"readings": _rows(), "horizon": 6})
    assert r.status_code == 200 and len(r.json["predictions"]) == 6 and "evaluation" in r.json
    assert client.post("/forecast", json={"readings": _rows(), "horizon": 99}).status_code == 400
    assert client.post("/forecast", json={"readings": []}).status_code == 400
    assert client.post("/forecast", data="not json", content_type="text/plain").status_code == 400


def test_service_anomalies(client):
    r = client.post("/anomalies", json={"readings": _rows()})
    assert r.status_code == 200 and "anomalies" in r.json
    assert client.post("/anomalies", json={"readings": _rows(), "contamination": 5}).status_code == 400


def test_service_token_enforced(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", "secret")
    c = create_app().test_client()
    assert c.post("/anomalies", json={}).status_code == 401
    assert c.get("/health").status_code == 200


# ---------- gaps (regression: a device outage used to put NaN into the model) ----------
def _gapped(gap_hours):
    rows = _rows(24 * 22)
    cut = 24 * 10
    return rows[:cut] + rows[cut + gap_hours:]


def test_short_gap_is_interpolated_without_nans():
    df = readings_to_frame(_gapped(6), 24 * 21)
    assert not df["power_kw"].isna().any()
    assert (df["ts"].diff().dropna() == pd.Timedelta(hours=1)).all()


def test_long_gap_keeps_only_latest_contiguous_run():
    df = readings_to_frame(_gapped(60), 24)
    assert not df["power_kw"].isna().any()
    assert (df["ts"].diff().dropna() == pd.Timedelta(hours=1)).all()
    assert len(df) < 24 * 22 - 60 + 1  # earlier segment was discarded
    with pytest.raises(InputError):
        readings_to_frame(_gapped(60), 24 * 21)


def test_service_forecast_survives_short_gap(client):
    r = client.post("/forecast", json={"readings": _gapped(10), "horizon": 24})
    assert r.status_code == 200 and len(r.json["predictions"]) == 24


def test_service_future_point_after_gap_is_handled(client):
    rows = _rows()
    last = pd.Timestamp(rows[-1]["ts"]) + pd.Timedelta(hours=15)
    rows.append({"ts": last.isoformat(), "power_kw": 1.5})
    assert client.post("/forecast", json={"readings": rows, "horizon": 24}).status_code == 200


def test_interpolated_hours_never_flagged_as_anomalies():
    df = readings_to_frame(_gapped(10), 24 * 21)
    assert (~df["observed"]).sum() == 10
    filled = set(df.loc[~df["observed"], "ts"].map(lambda t: t.isoformat()))
    flagged = {a["ts"] for a in anomaly.detect(df, contamination=0.1)}
    assert not (flagged & filled)
