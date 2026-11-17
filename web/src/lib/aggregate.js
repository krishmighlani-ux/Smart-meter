import { istDateKey, istMonthKey, istWeekKey } from "./time.js";

const KEYERS = { daily: istDateKey, weekly: istWeekKey, monthly: istMonthKey };
const LIMITS = { daily: 14, weekly: 12, monthly: 3 };
const FULL_HOURS = { daily: 24, weekly: 168 }; // monthly depends on the month

/**
 * Bucket hourly readings (energyKwh, powerKw, ts) by IST day / Monday-week / month.
 * Returns the latest N buckets, oldest first. Buckets with missing hours are
 * flagged `partial` instead of being silently presented as complete.
 */
export function aggregate(readings, range) {
  if (!KEYERS[range]) throw new Error(`unknown range: ${range}`);
  const keyOf = KEYERS[range];
  const map = new Map();
  for (const r of readings) {
    const k = keyOf(r.ts);
    const b = map.get(k) ?? { key: k, kwh: 0, peakKw: 0, hours: 0 };
    b.kwh += r.energyKwh;
    b.peakKw = Math.max(b.peakKw, r.powerKw);
    b.hours += 1;
    map.set(k, b);
  }
  const buckets = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-LIMITS[range]);
  return buckets.map((b) => {
    let full = FULL_HOURS[range];
    if (range === "monthly") {
      const [y, m] = b.key.split("-").map(Number);
      full = new Date(Date.UTC(y, m, 0)).getUTCDate() * 24;
    }
    return { ...b, kwh: round(b.kwh), peakKw: round(b.peakKw), partial: b.hours < full };
  });
}
const round = (v) => Math.round(v * 100) / 100;
