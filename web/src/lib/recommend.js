import { isPeakHour } from "./tariff.js";
import { istHour, istDateKey } from "./time.js";

/**
 * Rule-based recommendations from the last 28 days of hourly readings.
 * Savings are rough ESTIMATES with stated assumptions, not guarantees.
 */
export function recommend(readings, tariff) {
  const recent = readings.slice(-28 * 24);
  if (recent.length < 7 * 24) return [];
  const days = recent.length / 24;
  const total = sum(recent.map((r) => r.energyKwh));
  const peakKwh = sum(recent.filter((r) => isPeakHour(tariff, istHour(r.ts))).map((r) => r.energyKwh));
  const out = [];

  // 1. Shift flexible peak load (assume 15% is movable: washing machine, geyser, EV, pump)
  const peakShare = total ? peakKwh / total : 0;
  const shiftSaving = ((peakKwh / days) * 30 * 0.15) * (tariff.peakRate - tariff.offPeakRate);
  if (shiftSaving > 0 && peakShare > 0.2) {
    out.push(rec("shift-peak", "Shift flexible appliances out of peak hours", "high", shiftSaving,
      `${pct(peakShare)} of your energy is used between ${tariff.peakStartHour}:00 and ${tariff.peakEndHour}:00, when power costs ₹${tariff.peakRate}/kWh instead of ₹${tariff.offPeakRate}/kWh. Run the washing machine, geyser, water pump or EV charger outside this window.`,
      "Assumes 15% of peak-hour energy can be moved to off-peak."));
  }

  // 2. Standby / always-on load
  const night = recent.filter((r) => istHour(r.ts) < 5).map((r) => r.powerKw).sort((a, b) => a - b);
  const base = night[Math.floor(night.length * 0.2)] ?? 0;
  const standbySaving = base * 0.3 * 24 * 30 * tariff.offPeakRate;
  if (base > 0.15) {
    out.push(rec("standby", "Reduce always-on standby load", "medium", standbySaving,
      `Between midnight and 5 am your meter still shows about ${base.toFixed(2)} kW. Switch off set-top boxes, chargers, idle computers and unused appliances at the socket.`,
      "Assumes 30% of the overnight baseline can be switched off."));
  }

  // 3. Rising trend: compare last 7 days with the 7 days before
  const last7 = sum(recent.slice(-168).map((r) => r.energyKwh));
  const prev7 = sum(recent.slice(-336, -168).map((r) => r.energyKwh));
  if (prev7 > 0 && last7 / prev7 > 1.1) {
    const growth = last7 / prev7 - 1;
    out.push(rec("trend-up", "Consumption is rising week over week", "medium", ((last7 - prev7) / 7) * 30 * tariff.offPeakRate * 0.5,
      `The last 7 days used ${pct(growth)} more energy than the 7 days before. Check for a newly added appliance, a faulty fridge/AC or changed habits.`,
      "Assumes half of the increase could be avoided."));
  }

  // 4. Highest-consumption day of the week
  const byDow = new Map();
  for (const r of recent) {
    const k = istDateKey(r.ts);
    byDow.set(k, (byDow.get(k) ?? 0) + r.energyKwh);
  }
  const dayTotals = [...byDow.entries()].filter(([, v]) => v > 0);
  if (dayTotals.length >= 7) {
    const avg = sum(dayTotals.map(([, v]) => v)) / dayTotals.length;
    const [topDay, topKwh] = dayTotals.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (topKwh > avg * 1.3) {
      out.push(rec("top-day", `Review usage on ${topDay}`, "low", 0,
        `${topDay} used ${topKwh.toFixed(1)} kWh, about ${pct(topKwh / avg - 1)} above your daily average of ${avg.toFixed(1)} kWh. Think about what was different that day.`,
        "Informational; no saving is estimated."));
    }
  }
  return out.sort((a, b) => b.estimatedMonthlySavingInr - a.estimatedMonthlySavingInr);
}

const sum = (a) => a.reduce((s, x) => s + x, 0);
const pct = (v) => `${Math.round(v * 100)}%`;
const rec = (id, title, priority, saving, detail, assumption) => ({
  id, title, priority, detail, assumption, estimatedMonthlySavingInr: Math.round(saving),
});
