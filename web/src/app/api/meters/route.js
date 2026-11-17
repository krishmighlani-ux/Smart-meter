export const dynamic = "force-dynamic";
import { handle } from "@/lib/api";
import { getRepo } from "@/lib/db";
export const GET = handle(async () => {
  const repo = await getRepo();
  const meters = await repo.listMeters();
  const out = [];
  for (const m of meters) {
    const latest = await repo.getLatest(m.meterId);
    out.push({ ...m, latestReadingAt: latest?.ts ?? null, latestPowerKw: latest?.powerKw ?? null, totalReadings: await repo.countReadings(m.meterId) });
  }
  return { meters: out };
});
