export const dynamic = "force-dynamic";
import { handle, queryOf, resolveMeter } from "@/lib/api";
import { HttpError, meterQuery, parse, tariffPut } from "@/lib/validate";

export const GET = handle(async (req) => {
  const { meterId } = parse(meterQuery, queryOf(req));
  const { repo, meter } = await resolveMeter(meterId);
  return { meterId: meter.meterId, tariff: await repo.getTariff(meter.meterId) };
});
export const PUT = handle(async (req) => {
  let body;
  try { body = await req.json(); } catch { throw new HttpError(400, "Body must be valid JSON"); }
  const data = parse(tariffPut, body);
  const { repo, meter } = await resolveMeter(data.meterId);
  return { meterId: meter.meterId, tariff: await repo.setTariff(meter.meterId, data.tariff) };
});
