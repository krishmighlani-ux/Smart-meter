// Deterministic SIMULATED smart-meter data. Nothing here is a live sensor reading.
import { istHour, istShift } from "./time.js";

export const DEMO_METERS = [
  { meterId: "SM-HOME-001", name: "Demo Home", type: "Single-phase residential (simulated)", location: "Demo household", phase: "single", sampleIntervalMin: 60, scale: 1.0, shape: "home", seed: 2026 },
  { meterId: "SM-SHOP-002", name: "Demo Shop", type: "Single-phase commercial (simulated)", location: "Demo shop", phase: "single", sampleIntervalMin: 60, scale: 1.6, shape: "shop", seed: 77 },
];

const HOME = [0.30,0.28,0.27,0.27,0.30,0.45,0.80,1.10,1.10,0.85,0.70,0.70,0.75,0.80,0.75,0.70,0.80,1.10,1.50,2.00,2.10,1.90,1.20,0.60];
const SHOP = [0.20,0.20,0.20,0.20,0.20,0.25,0.30,0.60,1.20,1.60,1.80,1.90,1.80,1.70,1.80,1.90,1.80,1.60,1.50,1.20,0.80,0.40,0.25,0.20];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

/**
 * Generate `days` of hourly readings ending at `endTs` (inclusive, floored to the hour).
 * A few spikes are injected so the anomaly detector has something to find.
 */
export function generateReadings(meter, { days = 90, endTs = Date.now() } = {}) {
  const r = mulberry32(meter.seed);
  const end = Math.floor(endTs / 3600000) * 3600000;
  const n = days * 24;
  const profile = meter.shape === "shop" ? SHOP : HOME;
  const out = [];
  for (let i = 0; i < n; i++) {
    const ts = new Date(end - (n - 1 - i) * 3600000);
    const dow = istShift(ts).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const mult = meter.shape === "shop" ? (dow === 0 ? 0.5 : 1) : weekend ? 1.15 : 1;
    let kw = profile[istHour(ts)] * meter.scale * mult * (1 + 0.08 * gauss(r));
    out.push({ meterId: meter.meterId, ts, powerKw: Math.max(0.05, kw) });
  }
  // inject spikes at deterministic offsets from the end
  for (const [off, mult] of [[-9, 3.2], [-50, 3.6], [-131, 2.9], [-300, 4.1], [-610, 3.3]]) {
    const idx = n + off;
    if (idx > 0) out[idx].powerKw = out[idx].powerKw * mult + 0.8;
  }
  return out.map((x) => {
    const voltageV = 230 + gauss(r) * 2.5;
    const currentA = (x.powerKw * 1000) / (voltageV * 0.95);
    return {
      ...x,
      powerKw: round(x.powerKw, 3),
      energyKwh: round(x.powerKw * (meter.sampleIntervalMin / 60), 3),
      voltageV: round(voltageV, 1),
      currentA: round(currentA, 2),
      source: "simulated",
    };
  });
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
