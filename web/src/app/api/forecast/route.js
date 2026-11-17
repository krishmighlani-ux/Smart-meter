export const dynamic = "force-dynamic";
import { handle, loadRecent, queryOf, resolveMeter } from "@/lib/api";
import { forecastQuery, parse } from "@/lib/validate";
import { mlForecast } from "@/lib/mlClient";
import { rateAt } from "@/lib/tariff";

export const GET = handle(async (req) => {
  const q = parse(forecastQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(q.meterId);
  const data = await loadRecent(repo, meter.meterId, 60);
  if (!data.length) return { meter, empty: true };
  const tariff = await repo.getTariff(meter.meterId);
  const ml = await mlForecast(data, q.horizon);
  const predictions = ml.predictions.map((p) => ({ ts: p.ts, powerKw: p.power_kw, rateInrPerKwh: rateAt(tariff, p.ts) }));
  const ev = ml.evaluation;
  return {
    meter, dataSource: meter.source, horizonHours: q.horizon,
    predictions,
    predictedEnergyKwh: Math.round(ml.predicted_energy_kwh * 100) / 100,
    predictedCostInr: Math.round(predictions.reduce((s, p) => s + p.powerKw * p.rateInrPerKwh, 0) * 100) / 100,
    recent: data.slice(-48).map((r) => ({ ts: r.ts, powerKw: r.powerKw })),
    evaluation: {
      model: ev.model, trainRows: ev.train_rows, testRows: ev.test_rows, testPeriod: ev.test_period,
      metrics: { mae: ev.metrics.mae, rmse: ev.metrics.rmse, mapePct: ev.metrics.mape_pct, r2: ev.metrics.r2 },
      baseline: { name: ev.baseline.name, metrics: { mae: ev.baseline.metrics.mae, rmse: ev.baseline.metrics.rmse, mapePct: ev.baseline.metrics.mape_pct, r2: ev.baseline.metrics.r2 } },
    },
  };
});
