export const dynamic = "force-dynamic";
import { handle, loadRecent, queryOf, resolveMeter } from "@/lib/api";
import { parse, rangeQuery } from "@/lib/validate";
import { aggregate } from "@/lib/aggregate";

const DAYS = { daily: 14, weekly: 12 * 7 + 7, monthly: 100 };
export const GET = handle(async (req) => {
  const q = parse(rangeQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(q.meterId);
  const data = await loadRecent(repo, meter.meterId, DAYS[q.range]);
  const buckets = aggregate(data, q.range);
  const total = buckets.reduce((s, b) => s + b.kwh, 0);
  return { meter, range: q.range, buckets, totalKwh: Math.round(total * 100) / 100, dataSource: meter.source };
});
