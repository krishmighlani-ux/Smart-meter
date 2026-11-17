export const dynamic = "force-dynamic";
import { handle } from "@/lib/api";
import { getRepo } from "@/lib/db";
export const GET = handle(async () => {
  const repo = await getRepo();
  return { status: "ok", database: repo.mode, dataSource: repo.mode === "memory" ? "simulated demo data" : "MongoDB" };
});
