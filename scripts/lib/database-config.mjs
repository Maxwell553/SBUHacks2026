/** Shared PostgreSQL TLS settings for Polyhistor's provisioned TigerData service.
 * DATABASE_URL is server-only. DATABASE_CA_CERT is the pinned free-tier CA PEM,
 * stored as a single env value with literal \\n sequences.
 * Never pass sslmode=require alongside a pg ssl object: pg's URL parser may
 * override the CA options. Remove URL SSL flags before configuring TLS.
 */
export function databaseConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: local
      ? undefined
      : {
          rejectUnauthorized: true,
          ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, "\n") } : {}),
        },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    max: 3,
    application_name: "polyhistor",
  };
}
