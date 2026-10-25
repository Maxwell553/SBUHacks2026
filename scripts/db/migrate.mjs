import pg from "pg";
import { readFile } from "node:fs/promises";
import { databaseConfig } from "../lib/database-config.mjs";
const client = new pg.Client(
  databaseConfig({
    ...process.env,
    DATABASE_URL: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  }),
);
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('polyhistor-schema-v1'))");
  await client.query(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("PolyChronicle database schema migrated successfully.");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", e.code ?? e.name);
  process.exitCode = 1;
} finally {
  await client.end();
}
