export const dynamic = "force-dynamic";
import { handle, loadRecent, queryOf, resolveMeter } from "@/lib/api";
import { meterQuery, parse } from "@/lib/validate";
import { recommend } from "@/lib/recommend";

export const GET = handle(async (req) => {
  const { meterId } = parse(meterQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(meterId);
  const tariff = await repo.getTariff(meter.meterId);
  const data = await loadRecent(repo, meter.meterId, 28);
  const recommendations = recommend(data, tariff);
  return { meter, tariff, dataSource: meter.source, recommendations, note: data.length < 168 ? "Not enough data yet (need at least 7 days)." : undefined };
});
