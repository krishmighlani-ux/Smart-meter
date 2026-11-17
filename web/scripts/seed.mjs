// Seeds MongoDB with SIMULATED demo meters, 90 days of hourly readings and default tariffs.
// Usage: npm run seed   (requires MONGODB_URI in .env.local or the environment)
import { MongoClient } from "mongodb";
import { DEMO_METERS, generateReadings } from "../src/lib/simulate.js";
import { DEFAULT_TARIFF } from "../src/lib/tariff.js";

for (const f of [".env.local", ".env"]) { try { process.loadEnvFile(f); } catch {} }
const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in."); process.exit(1); }

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "smartmeter");
  await db.collection("readings").createIndex({ meterId: 1, ts: 1 }, { unique: true });
  await db.collection("meters").createIndex({ meterId: 1 }, { unique: true });
  await db.collection("tariffs").createIndex({ meterId: 1 }, { unique: true });
  const endTs = Date.now();
  for (const { scale, shape, seed, ...meter } of DEMO_METERS) {
    await db.collection("meters").updateOne({ meterId: meter.meterId }, { $set: { ...meter, source: "simulated", status: "online-simulated", installedAt: new Date("2026-01-01") } }, { upsert: true });
    await db.collection("tariffs").updateOne({ meterId: meter.meterId }, { $setOnInsert: { ...DEFAULT_TARIFF, meterId: meter.meterId } }, { upsert: true });
    await db.collection("readings").deleteMany({ meterId: meter.meterId, source: "simulated" });
    const rows = generateReadings(DEMO_METERS.find((m) => m.meterId === meter.meterId), { days: 90, endTs });
    for (let i = 0; i < rows.length; i += 1000) await db.collection("readings").insertMany(rows.slice(i, i + 1000));
    console.log(`Seeded ${meter.meterId}: ${rows.length} simulated readings`);
  }
  console.log("Done.");
} catch (err) {
  console.error("Seeding failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
