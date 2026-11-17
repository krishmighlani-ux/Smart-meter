export const dynamic = "force-dynamic";
import { handle, queryOf, resolveMeter } from "@/lib/api";
import { HttpError, historyQuery, ingestSchema, parse } from "@/lib/validate";
import { istDateKey } from "@/lib/time";
import { rateAt } from "@/lib/tariff";
import { timingSafeEqual } from "node:crypto";

const IST_MIDNIGHT = (d) => new Date(d + "T00:00:00+05:30");

// GET /api/readings?meterId=&date=YYYY-MM-DD&page=&pageSize=  -> historical readings (one IST day)
export const GET = handle(async (req) => {
  const q = parse(historyQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(q.meterId);
  const latest = await repo.getLatest(meter.meterId);
  if (!latest) return { meter, date: null, total: 0, readings: [], page: 1, pageSize: q.pageSize };
  const date = q.date ?? istDateKey(latest.ts);
  const from = IST_MIDNIGHT(date);
  if (Number.isNaN(+from)) throw new HttpError(400, "date: not a valid calendar date");
  const to = new Date(+from + 86400000);
  const tariff = await repo.getTariff(meter.meterId);
  const [rows, total] = await Promise.all([
    repo.getReadings(meter.meterId, { from, to, skip: (q.page - 1) * q.pageSize, limit: q.pageSize }),
    repo.countReadings(meter.meterId, { from, to }),
  ]);
  return {
    meter, date, page: q.page, pageSize: q.pageSize, total,
    readings: rows.map((r) => ({ ...r, rateInrPerKwh: rateAt(tariff, r.ts), costInr: Math.round(r.energyKwh * rateAt(tariff, r.ts) * 100) / 100 })),
  };
});

// POST /api/readings  (for ESP32 / other devices). Requires x-api-key = INGEST_API_KEY.
export const POST = handle(async (req) => {
  const key = process.env.INGEST_API_KEY;
  if (!key) throw new HttpError(503, "Ingestion is disabled: INGEST_API_KEY is not configured");
  const given = Buffer.from(req.headers.get("x-api-key") ?? "");
  const want = Buffer.from(key);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "Invalid API key");
  let body;
  try { body = await req.json(); } catch { throw new HttpError(400, "Body must be valid JSON"); }
  const data = parse(ingestSchema, body);
  const { repo, meter } = await resolveMeter(data.meterId);
  const rows = data.readings.map((r) => ({
    meterId: meter.meterId, ts: new Date(r.ts), powerKw: r.powerKw,
    energyKwh: Math.round(r.powerKw * (meter.sampleIntervalMin / 60) * 1000) / 1000,
    voltageV: r.voltageV, currentA: r.currentA, source: "device",
  }));
  return repo.insertReadings(meter.meterId, rows);
});
