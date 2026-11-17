import { istHour } from "./time.js";

/** Configurable time-of-day tariff (INR). Real utility slabs are NOT modelled. */
export const DEFAULT_TARIFF = {
  offPeakRate: 6.5,
  peakRate: 9.5,
  peakStartHour: 18,
  peakEndHour: 23,
  fixedMonthlyCharge: 120,
};

export function isPeakHour(tariff, hour) {
  const { peakStartHour: s, peakEndHour: e } = tariff;
  return s < e ? hour >= s && hour < e : hour >= s || hour < e; // supports windows crossing midnight
}
export function rateAt(tariff, ts) {
  return isPeakHour(tariff, istHour(ts)) ? tariff.peakRate : tariff.offPeakRate;
}
export function energyCost(readings, tariff) {
  return readings.reduce((sum, r) => sum + r.energyKwh * rateAt(tariff, r.ts), 0);
}
/**
 * Estimate a 30-day bill from the most recent `days` of readings.
 * energy cost per day (averaged) x 30 + fixed monthly charge.
 */
export function estimateMonthlyBill(readings, tariff, days = 7) {
  const recent = readings.slice(-days * 24);
  if (recent.length < 24) return { energyKwh: 0, energyCost: 0, fixedCharge: tariff.fixedMonthlyCharge, total: tariff.fixedMonthlyCharge, basisDays: 0 };
  const basisDays = recent.length / 24;
  const kwhPerDay = recent.reduce((s, r) => s + r.energyKwh, 0) / basisDays;
  const costPerDay = energyCost(recent, tariff) / basisDays;
  const energy = costPerDay * 30;
  return {
    energyKwh: round(kwhPerDay * 30),
    energyCost: round(energy),
    fixedCharge: tariff.fixedMonthlyCharge,
    total: round(energy + tariff.fixedMonthlyCharge),
    basisDays: round(basisDays),
  };
}
const round = (v) => Math.round(v * 100) / 100;
