import test from "node:test";
import assert from "node:assert/strict";
import { istDateKey, istHour, istWeekKey, istMonthKey } from "../src/lib/time.js";
import { aggregate } from "../src/lib/aggregate.js";
import { DEFAULT_TARIFF, isPeakHour, rateAt, estimateMonthlyBill, energyCost } from "../src/lib/tariff.js";
import { recommend } from "../src/lib/recommend.js";
import { generateReadings, DEMO_METERS } from "../src/lib/simulate.js";
import { tariffSchema, ingestSchema, historyQuery, parse, HttpError } from "../src/lib/validate.js";
import { getRepo } from "../src/lib/db.js";

const end = Date.parse("2026-10-30T12:00:00Z");
const home = DEMO_METERS[0];

test("IST helpers convert UTC to +05:30", () => {
  assert.equal(istHour("2026-10-30T18:30:00Z"), 0);
  assert.equal(istDateKey("2026-10-30T18:30:00Z"), "2026-10-31");
  assert.equal(istMonthKey("2026-10-31T19:00:00Z"), "2026-11");
  assert.equal(istWeekKey("2026-10-30T10:00:00Z"), "2026-10-26"); // Friday -> Monday
});

test("simulation is deterministic, positive and labelled simulated", () => {
  const a = generateReadings(home, { days: 5, endTs: end });
  const b = generateReadings(home, { days: 5, endTs: end });
  assert.deepEqual(a, b);
  assert.equal(a.length, 120);
  assert.ok(a.every((r) => r.powerKw > 0 && r.source === "simulated"));
  assert.ok(Math.abs(a[0].energyKwh - a[0].powerKw) < 0.001); // hourly: kWh == kW
});

test("aggregate daily sums kWh and flags partial buckets", () => {
  const rows = generateReadings(home, { days: 10, endTs: end });
  const daily = aggregate(rows, "daily");
  const total = daily.reduce((s, d) => s + d.kwh, 0);
  const expected = rows.reduce((s, r) => s + r.energyKwh, 0);
  assert.ok(Math.abs(total - expected) < 0.5);
  assert.ok(daily.every((d) => d.hours <= 24));
  assert.ok(daily.some((d) => d.partial) || daily.every((d) => d.hours === 24));
});

test("aggregate weekly and monthly limit bucket counts; reject unknown range", () => {
  const rows = generateReadings(home, { days: 120, endTs: end });
  assert.ok(aggregate(rows, "weekly").length <= 12);
  assert.ok(aggregate(rows, "monthly").length <= 3);
  assert.throws(() => aggregate(rows, "yearly"));
});

test("peak window logic, including windows crossing midnight", () => {
  assert.equal(isPeakHour(DEFAULT_TARIFF, 19), true);
  assert.equal(isPeakHour(DEFAULT_TARIFF, 23), false);
  const night = { ...DEFAULT_TARIFF, peakStartHour: 22, peakEndHour: 6 };
  assert.equal(isPeakHour(night, 23), true);
  assert.equal(isPeakHour(night, 3), true);
  assert.equal(isPeakHour(night, 12), false);
});

test("rate and cost use IST hour", () => {
  // 14:00Z = 19:30 IST -> peak
  assert.equal(rateAt(DEFAULT_TARIFF, "2026-10-30T14:00:00Z"), DEFAULT_TARIFF.peakRate);
  assert.equal(rateAt(DEFAULT_TARIFF, "2026-10-30T04:00:00Z"), DEFAULT_TARIFF.offPeakRate);
  const cost = energyCost([{ ts: "2026-10-30T14:00:00Z", energyKwh: 2 }], DEFAULT_TARIFF);
  assert.equal(cost, 2 * DEFAULT_TARIFF.peakRate);
});

test("monthly bill: constant 1 kWh/h at flat tariff", () => {
  const rows = Array.from({ length: 7 * 24 }, (_, i) => ({ ts: new Date(end - i * 3600000), energyKwh: 1, powerKw: 1 }));
  const flat = { offPeakRate: 10, peakRate: 10, peakStartHour: 18, peakEndHour: 23, fixedMonthlyCharge: 100 };
  const b = estimateMonthlyBill(rows, flat, 7);
  assert.equal(b.energyKwh, 720);
  assert.equal(b.total, 7200 + 100);
});

test("monthly bill with too little data returns only the fixed charge", () => {
  assert.equal(estimateMonthlyBill([], DEFAULT_TARIFF).total, DEFAULT_TARIFF.fixedMonthlyCharge);
});

test("recommendations: empty for short history, peak shifting present for home profile", () => {
  assert.deepEqual(recommend(generateReadings(home, { days: 3, endTs: end }), DEFAULT_TARIFF), []);
  const recs = recommend(generateReadings(home, { days: 40, endTs: end }), DEFAULT_TARIFF);
  const shift = recs.find((r) => r.id === "shift-peak");
  assert.ok(shift && shift.estimatedMonthlySavingInr > 0 && shift.assumption);
  // No saving when peak rate equals off-peak rate
  const none = recommend(generateReadings(home, { days: 40, endTs: end }), { ...DEFAULT_TARIFF, peakRate: 6.5 });
  assert.equal(none.find((r) => r.id === "shift-peak"), undefined);
});

test("tariff validation", () => {
  assert.ok(tariffSchema.safeParse(DEFAULT_TARIFF).success);
  assert.ok(!tariffSchema.safeParse({ ...DEFAULT_TARIFF, peakRate: 1 }).success);
  assert.ok(!tariffSchema.safeParse({ ...DEFAULT_TARIFF, offPeakRate: -2 }).success);
  assert.ok(!tariffSchema.safeParse({ ...DEFAULT_TARIFF, peakStartHour: 25 }).success);
  assert.ok(!tariffSchema.safeParse({ ...DEFAULT_TARIFF, peakStartHour: 5, peakEndHour: 5 }).success);
});

test("ingest validation", () => {
  const ok = { meterId: "SM-HOME-001", readings: [{ ts: "2026-10-30T10:00:00Z", powerKw: 1.2 }] };
  assert.ok(ingestSchema.safeParse(ok).success);
  assert.ok(!ingestSchema.safeParse({ ...ok, meterId: "a b;" }).success);
  assert.ok(!ingestSchema.safeParse({ ...ok, readings: [] }).success);
  assert.ok(!ingestSchema.safeParse({ ...ok, readings: [{ ts: "yesterday", powerKw: 1 }] }).success);
  assert.ok(!ingestSchema.safeParse({ ...ok, readings: [{ ts: "2026-10-30T10:00:00Z", powerKw: -3 }] }).success);
});

test("parse() throws HttpError 400 with readable message", () => {
  assert.throws(() => parse(historyQuery, { date: "30-10-2026" }), (e) => e instanceof HttpError && e.status === 400 && /date/.test(e.message));
  assert.equal(parse(historyQuery, {}).pageSize, 24);
});

test("memory repository: list, read, upsert ingest, tariff", async () => {
  delete process.env.MONGODB_URI;
  const repo = await getRepo();
  assert.equal(repo.mode, "memory");
  const meters = await repo.listMeters();
  assert.equal(meters.length, 2);
  const latest = await repo.getLatest("SM-HOME-001");
  const next = { meterId: "SM-HOME-001", ts: new Date(+latest.ts + 3600000), powerKw: 1, energyKwh: 1, source: "device" };
  assert.deepEqual(await repo.insertReadings("SM-HOME-001", [next]), { received: 1, inserted: 1, updated: 0 });
  assert.deepEqual(await repo.insertReadings("SM-HOME-001", [next]), { received: 1, inserted: 0, updated: 1 });
  assert.equal(await repo.getMeter("nope"), null);
  await repo.setTariff("SM-HOME-001", { ...DEFAULT_TARIFF, peakRate: 12 });
  assert.equal((await repo.getTariff("SM-HOME-001")).peakRate, 12);
});
