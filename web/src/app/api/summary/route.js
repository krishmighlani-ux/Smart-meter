export const dynamic = "force-dynamic";
import { handle, loadRecent, queryOf, resolveMeter } from "@/lib/api";
import { meterQuery, parse } from "@/lib/validate";
import { istDateKey } from "@/lib/time";
import { estimateMonthlyBill, energyCost } from "@/lib/tariff";

export const GET = handle(async (req) => {
  const { meterId } = parse(meterQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(meterId);
  const tariff = await repo.getTariff(meter.meterId);
  const data = await loadRecent(repo, meter.meterId, 14);
  if (!data.length) return { meter, empty: true };
  const latest = data[data.length - 1];
  const today = data.filter((r) => istDateKey(r.ts) === istDateKey(latest.ts));
  const week = data.slice(-168);
  const peak = week.reduce((a, r) => (r.powerKw > a.powerKw ? r : a), week[0]);
  const last24 = data.slice(-24), prev24 = data.slice(-48, -24);
  const sum = (a) => a.reduce((s, r) => s + r.energyKwh, 0);
  return {
    meter,
    dataSource: meter.source,
    latest: { ts: latest.ts, powerKw: latest.powerKw, voltageV: latest.voltageV, currentA: latest.currentA },
    todayKwh: Math.round(sum(today) * 100) / 100,
    todayCostInr: Math.round(energyCost(today, tariff) * 100) / 100,
    monthlyBill: estimateMonthlyBill(data, tariff, 7),
    peak7d: { powerKw: peak.powerKw, ts: peak.ts },
    last24hKwh: Math.round(sum(last24) * 100) / 100,
    previous24hKwh: Math.round(sum(prev24) * 100) / 100,
    trend: last24.map((r, i) => ({ ts: r.ts, powerKw: r.powerKw, previousPowerKw: prev24[i]?.powerKw ?? null })),
  };
});
