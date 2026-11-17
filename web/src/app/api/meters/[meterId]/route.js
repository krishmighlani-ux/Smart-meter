export const dynamic = "force-dynamic";
import { handle, resolveMeter } from "@/lib/api";
import { meterIdSchema, parse } from "@/lib/validate";
export const GET = handle(async (_req, { params }) => {
  const id = parse(meterIdSchema, params.meterId);
  const { repo, meter } = await resolveMeter(id);
  return { meter, tariff: await repo.getTariff(id), totalReadings: await repo.countReadings(id) };
});
