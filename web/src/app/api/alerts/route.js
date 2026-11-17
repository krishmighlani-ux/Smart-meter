export const dynamic = "force-dynamic";
import { handle, loadRecent, queryOf, resolveMeter } from "@/lib/api";
import { meterQuery, parse } from "@/lib/validate";
import { mlAnomalies, mlSelfCheck } from "@/lib/mlClient";

export const GET = handle(async (req) => {
  const { meterId } = parse(meterQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(meterId);
  const data = await loadRecent(repo, meter.meterId, 60);
  if (data.length < 24 * 7) return { meter, alerts: [], analysedRows: data.length, note: "Not enough readings yet (need at least 7 days)." };
  const [res, selfCheck] = await Promise.all([mlAnomalies(data), mlSelfCheck().catch(() => null)]);
  const alerts = res.anomalies.slice(0, 100).map((a) => ({
    id: meter.meterId + "-" + a.ts, ts: a.ts, severity: a.severity, direction: a.direction,
    powerKw: a.power_kw, expectedKw: a.expected_kw, ratio: a.ratio, explanation: a.explanation,
  }));
  return {
    meter, dataSource: meter.source, analysedRows: res.analysed_rows, alerts, selfCheck,
    disclaimer: "An anomaly is a warning that a reading is unusual. It is not proof of a fault or of electricity theft.",
  };
});
