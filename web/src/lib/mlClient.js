import { HttpError } from "./validate.js";

const url = () => process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

async function call(path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url() + path, {
      ...init,
      cache: "no-store", // never reuse a previous ML answer: data changes between calls
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(process.env.ML_SERVICE_TOKEN && { "X-ML-Token": process.env.ML_SERVICE_TOKEN }) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status === 400 ? 422 : 502, body.error || "ML service error");
    return body;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, "ML service is unreachable. Start it with `python -m smartmeter_ml.service` (see README).");
  } finally {
    clearTimeout(timer);
  }
}

export const toMlRows = (readings) => readings.map((r) => ({ ts: new Date(r.ts).toISOString(), power_kw: r.powerKw }));
export const mlForecast = (readings, horizon) => call("/forecast", { method: "POST", body: JSON.stringify({ readings: toMlRows(readings), horizon }) });
export const mlAnomalies = (readings) => call("/anomalies", { method: "POST", body: JSON.stringify({ readings: toMlRows(readings) }) });
export const mlSelfCheck = () => call("/anomalies/self-check", { method: "GET" });
