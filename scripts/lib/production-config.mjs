// Pure validation: never prints values or contacts a service.
export function productionConfigIssues(env) {
  const issues = [];
  for (const key of [
    "GEMINI_API_KEY",
    "DATABASE_URL",
    "APP_URL",
    "NEXT_PUBLIC_CONTACT_EMAIL",
    "NEXT_PUBLIC_LEGAL_ENTITY",
  ])
    if (!env[key]?.trim()) issues.push(`${key} is required for public deployment.`);
  if (env.MIGRATION_DATABASE_URL)
    issues.push("Remove MIGRATION_DATABASE_URL from the runtime environment; use it only for migrations.");
  for (const key of ["APP_URL", "NEXT_PUBLIC_SITE_URL"]) {
    if (!env[key]) continue;
    try {
      const u = new URL(env[key]);
      if (
        u.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/"
      )
        issues.push(`${key} must be a public HTTPS origin without a path, query or credentials.`);
    } catch {
      issues.push(`${key} must be a valid HTTPS origin.`);
    }
  }
  if (
    env.APP_URL &&
    env.NEXT_PUBLIC_SITE_URL &&
    env.APP_URL.replace(/\/$/, "") !== env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  )
    issues.push("APP_URL and NEXT_PUBLIC_SITE_URL must agree for the production deployment.");
  if (env.NEXT_PUBLIC_CONTACT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NEXT_PUBLIC_CONTACT_EMAIL))
    issues.push("NEXT_PUBLIC_CONTACT_EMAIL must be an email address you operate.");
  if (env.GEMINI_PROVIDER && !["vertex", "developer"].includes(env.GEMINI_PROVIDER))
    issues.push("GEMINI_PROVIDER must be vertex or developer.");
  if (env.DATABASE_URL) {
    try {
      const u = new URL(env.DATABASE_URL);
      if (
        !["postgres:", "postgresql:"].includes(u.protocol) ||
        !u.username ||
        !u.password ||
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      )
        issues.push("DATABASE_URL must identify an authenticated production PostgreSQL service.");
    } catch {
      issues.push("DATABASE_URL must be a valid PostgreSQL URL.");
    }
  }
  for (const key of Object.keys(env))
    if (/^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY|DATABASE_URL)/i.test(key) && env[key])
      issues.push(`${key} would expose a credential to the browser; use a server-only variable.`);
  return issues;
}
