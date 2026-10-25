// Read-only connectivity check. Never prints credentials or the connection URL.
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Add the Tiger Cloud PostgreSQL connection string to .env.local.");
  process.exit(1);
}
let parsed;
try {
  parsed = new URL(connectionString);
} catch {
  console.error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  process.exit(1);
}
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
const sslmode = parsed.searchParams.get("sslmode");
if (!local && (sslmode === "disable" || sslmode === "no-verify")) {
  console.error("Remote database connections must verify TLS certificates. Remove the insecure sslmode.");
  process.exit(1);
}
// Explicit TLS config avoids driver URL flags silently disabling verification.
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) parsed.searchParams.delete(key);
const client = new pg.Client({
  connectionString: parsed.toString(),
  ssl: local
    ? undefined
    : {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : {}),
      },
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
  application_name: "polyhistor-connectivity-check",
});
try {
  await client.connect();
  const {
    rows: [result],
  } = await client.query(`SELECT current_database() AS database,
    current_user AS role, version() AS version,
    has_schema_privilege(current_user, 'public', 'CREATE') AS can_migrate,
    (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls`);
  console.log(
    JSON.stringify(
      {
        connected: true,
        tls: result.tls,
        canMigrate: result.can_migrate,
        postgresVersion: result.version.split(" ").slice(0, 2).join(" "),
      },
      null,
      2,
    ),
  );
} catch (error) {
  let message = String(error.message);
  for (const secret of [connectionString, parsed.password, decodeURIComponent(parsed.password)]) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  console.error(
    JSON.stringify({
      connected: false,
      code: error.code ?? "CONNECTION_FAILED",
      message,
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
