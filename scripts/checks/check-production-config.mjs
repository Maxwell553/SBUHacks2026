import { productionConfigIssues } from "../lib/production-config.mjs";
const issues = productionConfigIssues(process.env);
if (issues.length) {
  console.error("Public deployment configuration is not ready:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    "PASS production configuration structure. Verify contact ownership, DB role/TLS, provider access and deployed flows separately.",
  );
}
