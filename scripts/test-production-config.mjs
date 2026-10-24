import assert from "node:assert/strict";
import test from "node:test";
import { productionConfigIssues } from "./lib/production-config.mjs";
const valid = {
  GEMINI_API_KEY: "test-only",
  GEMINI_PROVIDER: "vertex",
  DATABASE_URL: "postgresql://app:fake@db.example.com/production",
  APP_URL: "https://history.example.com",
  NEXT_PUBLIC_SITE_URL: "https://history.example.com/",
  NEXT_PUBLIC_CONTACT_EMAIL: "team@example.com",
  NEXT_PUBLIC_LEGAL_ENTITY: "Example team",
};
test("valid runtime configuration and optional canonical fallback", () => {
  assert.deepEqual(productionConfigIssues(valid), []);
  assert.deepEqual(productionConfigIssues({ ...valid, NEXT_PUBLIC_SITE_URL: undefined }), []);
});
test("missing config, runtime admin credential and browser secrets fail", () => {
  assert(productionConfigIssues({}).length >= 5);
  for (const extra of [{ MIGRATION_DATABASE_URL: "secret" }, { NEXT_PUBLIC_API_KEY: "secret" }])
    assert(productionConfigIssues({ ...valid, ...extra }).length > 0);
});
test("unsafe or inconsistent origins and invalid database are rejected without leaking values", () => {
  for (const origin of [
    "http://example.com",
    "https://localhost",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?secret=xyz",
    "not a URL",
  ])
    assert(productionConfigIssues({ ...valid, APP_URL: origin }).length > 0);
  assert(productionConfigIssues({ ...valid, DATABASE_URL: "https://secret@example.com" }).length > 0);
  assert(
    !productionConfigIssues({ ...valid, DATABASE_URL: "sensitive-invalid-value" })
      .join()
      .includes("sensitive-invalid-value"),
  );
});
