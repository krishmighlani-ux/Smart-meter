// Data access layer. Uses MongoDB when MONGODB_URI is set; otherwise an
// in-memory store filled with SIMULATED demo data so the app runs with zero setup.
import { DEFAULT_TARIFF } from "./tariff.js";
import { DEMO_METERS, generateReadings } from "./simulate.js";

const strip = ({ scale, shape, seed, ...m }) => m;
export const publicMeter = (m) => ({ ...strip(m), source: m.source ?? "simulated", status: m.status ?? "online-simulated" });

// ---------------- in-memory repository ----------------
function createMemoryRepo() {
  const meters = new Map();
  const readings = new Map(); // meterId -> sorted array
  const tariffs = new Map();
  const endTs = Date.now();
  for (const m of DEMO_METERS) {
    meters.set(m.meterId, { ...strip(m), source: "simulated", status: "online-simulated", installedAt: new Date("2026-01-01") });
    readings.set(m.meterId, generateReadings(m, { days: 90, endTs }));
    tariffs.set(m.meterId, { ...DEFAULT_TARIFF });
  }
  return {
    mode: "memory",
    async listMeters() { return [...meters.values()]; },
    async getMeter(id) { return meters.get(id) ?? null; },
    async getLatest(id) { const a = readings.get(id); return a?.length ? a[a.length - 1] : null; },
    async getReadings(id, { from, to, skip = 0, limit = 0, desc = false } = {}) {
      let a = (readings.get(id) ?? []).filter((r) => (!from || r.ts >= from) && (!to || r.ts < to));
      if (desc) a = [...a].reverse();
      a = a.slice(skip);
      return limit ? a.slice(0, limit) : a;
    },
    async countReadings(id, { from, to } = {}) {
      return (readings.get(id) ?? []).filter((r) => (!from || r.ts >= from) && (!to || r.ts < to)).length;
    },
    async insertReadings(id, rows) {
      const a = readings.get(id);
      const byTs = new Map(a.map((r) => [+r.ts, r]));
      let inserted = 0;
      for (const r of rows) { if (!byTs.has(+r.ts)) inserted++; byTs.set(+r.ts, r); }
      readings.set(id, [...byTs.values()].sort((x, y) => x.ts - y.ts));
      return { received: rows.length, inserted, updated: rows.length - inserted };
    },
    async getTariff(id) { return tariffs.get(id) ?? { ...DEFAULT_TARIFF }; },
    async setTariff(id, t) { tariffs.set(id, t); return t; },
  };
}

// ---------------- MongoDB repository ----------------
async function createMongoRepo(uri, dbName) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(dbName);
  const C = { meters: db.collection("meters"), readings: db.collection("readings"), tariffs: db.collection("tariffs") };
  const clean = ({ _id, ...rest }) => rest;
  const range = (id, from, to) => ({ meterId: id, ...(from || to ? { ts: { ...(from && { $gte: from }), ...(to && { $lt: to }) } } : {}) });
  return {
    mode: "mongodb",
    async listMeters() { return (await C.meters.find({}).sort({ meterId: 1 }).toArray()).map(clean); },
    async getMeter(id) { const m = await C.meters.findOne({ meterId: id }); return m ? clean(m) : null; },
    async getLatest(id) { const r = await C.readings.find({ meterId: id }).sort({ ts: -1 }).limit(1).next(); return r ? clean(r) : null; },
    async getReadings(id, { from, to, skip = 0, limit = 0, desc = false } = {}) {
      let cur = C.readings.find(range(id, from, to)).sort({ ts: desc ? -1 : 1 }).skip(skip);
      if (limit) cur = cur.limit(limit);
      return (await cur.toArray()).map(clean);
    },
    async countReadings(id, { from, to } = {}) { return C.readings.countDocuments(range(id, from, to)); },
    async insertReadings(id, rows) {
      const res = await C.readings.bulkWrite(
        rows.map((r) => ({ updateOne: { filter: { meterId: id, ts: r.ts }, update: { $set: r }, upsert: true } })),
        { ordered: false }
      );
      return { received: rows.length, inserted: res.upsertedCount, updated: res.modifiedCount };
    },
    async getTariff(id) { const t = await C.tariffs.findOne({ meterId: id }); return t ? { ...DEFAULT_TARIFF, ...clean(t) } : { ...DEFAULT_TARIFF }; },
    async setTariff(id, t) { await C.tariffs.updateOne({ meterId: id }, { $set: { ...t, meterId: id, updatedAt: new Date() } }, { upsert: true }); return t; },
  };
}

export async function getRepo() {
  const g = globalThis;
  if (!g.__smRepo) {
    const uri = process.env.MONGODB_URI;
    g.__smRepo = uri ? createMongoRepo(uri, process.env.MONGODB_DB || "smartmeter") : Promise.resolve(createMemoryRepo());
    g.__smRepo.catch(() => { g.__smRepo = null; }); // allow retry after a failed connection
  }
  return g.__smRepo;
}
