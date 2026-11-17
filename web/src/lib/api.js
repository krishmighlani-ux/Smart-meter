import { NextResponse } from "next/server";
import { HttpError } from "./validate.js";
import { getRepo } from "./db.js";

/** Wrap a route handler so errors become safe JSON (no stack traces or secrets). */
export function handle(fn) {
  return async (req, ctx) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error("[api]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export const queryOf = (req) => Object.fromEntries(new URL(req.url).searchParams);

export async function resolveMeter(meterId) {
  const repo = await getRepo();
  const meter = meterId ? await repo.getMeter(meterId) : (await repo.listMeters())[0];
  if (!meter) throw new HttpError(404, meterId ? "Meter not found" : "No meters found. Run `npm run seed` first.");
  return { repo, meter };
}

/** Readings for the `days` before (and including) the latest reading. */
export async function loadRecent(repo, meterId, days) {
  const latest = await repo.getLatest(meterId);
  if (!latest) return [];
  const from = new Date(new Date(latest.ts).getTime() - days * 86400000 + 3600000);
  return repo.getReadings(meterId, { from });
}
