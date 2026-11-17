"""Small Flask service exposing the ML functions to the Next.js backend."""
from __future__ import annotations

import hashlib
import os
from functools import lru_cache

from flask import Flask, jsonify, request

from . import anomaly, forecast
from .validation import MIN_ROWS_ANOMALY, MIN_ROWS_FORECAST, InputError, readings_to_frame


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
    token = os.environ.get("ML_SERVICE_TOKEN", "")

    @app.before_request
    def _auth():
        if token and request.path != "/health" and request.headers.get("X-ML-Token") != token:
            return jsonify(error="unauthorized"), 401

    @app.errorhandler(InputError)
    def _bad_input(err):
        return jsonify(error=str(err)), 400

    @app.errorhandler(Exception)
    def _unexpected(err):  # never leak internals
        app.logger.exception("unhandled error")
        return jsonify(error="internal error"), 500

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    def _body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise InputError("body must be a JSON object")
        return data

    @app.post("/forecast")
    def forecast_route():
        data = _body()
        df = readings_to_frame(data.get("readings"), MIN_ROWS_FORECAST)
        horizon = data.get("horizon", 24)
        if not isinstance(horizon, int) or isinstance(horizon, bool) or not 1 <= horizon <= forecast.MAX_HORIZON:
            raise InputError("horizon must be an integer from 1 to 24")
        key = hashlib.sha1(f"{df['ts'].iloc[-1]}|{len(df)}|{df['power_kw'].sum():.4f}|{horizon}".encode()).hexdigest()
        return jsonify(_cached_forecast(key, df, horizon))

    _results: dict = {}

    def _cached_forecast(key, df, horizon):
        if key not in _results:
            if len(_results) > 32:
                _results.clear()
            result = forecast.forecast(df, horizon)
            result["evaluation"] = forecast.evaluate(df)
            _results[key] = result
        return _results[key]

    @app.post("/anomalies")
    def anomalies_route():
        data = _body()
        df = readings_to_frame(data.get("readings"), MIN_ROWS_ANOMALY)
        contamination = data.get("contamination", 0.01)
        if not isinstance(contamination, (int, float)) or not 0 < contamination <= 0.1:
            raise InputError("contamination must be a number in (0, 0.1]")
        return jsonify(anomalies=anomaly.detect(df, float(contamination)), analysed_rows=len(df))

    @app.get("/anomalies/self-check")
    def self_check():
        return jsonify(_self_check())

    @lru_cache(maxsize=1)
    def _self_check():
        return anomaly.self_check()

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host=os.environ.get("ML_HOST", "127.0.0.1"), port=int(os.environ.get("ML_PORT", "8001")))
