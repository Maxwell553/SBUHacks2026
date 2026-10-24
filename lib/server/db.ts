import { attachDatabasePool } from "@vercel/functions";
import pg, { type PoolClient, type QueryResultRow } from "pg";

const globalDb = globalThis as unknown as { polyhistorPool?: pg.Pool };
function makePool() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Database configuration is missing");
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const databasePool = new pg.Pool({
    connectionString: url.toString(),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    ssl: local
      ? undefined
      : {
          rejectUnauthorized: true,
          ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : {}),
        },
    application_name: "polyhistor",
  });
  databasePool.on("error", (error) => {
    // Idle sockets may close during TigerData maintenance. pg removes them;
    // handle the event so the process can reconnect on the next request.
    console.error("Idle database connection closed", (error as NodeJS.ErrnoException).code ?? error.name);
  });
  attachDatabasePool(databasePool);
  return databasePool;
}
export function pool() {
  return (globalDb.polyhistorPool ??= makePool());
}
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return pool().query<T>(sql, values);
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
