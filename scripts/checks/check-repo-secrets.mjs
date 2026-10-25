// Scans files Git considers commit candidates without printing matched secret values.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const secrets = [process.env.GEMINI_API_KEY, process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL].filter(
  Boolean,
);
for (const value of [process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL].filter(Boolean)) {
  try {
    const u = new URL(value);
    if (u.password) secrets.push(u.password, decodeURIComponent(u.password));
  } catch {}
}
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AIza[0-9A-Za-z_-]{35}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{60,}/,
];
const stagedFiles = new Set(execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean));
function inspect(file, content, location) {
  if (
    secrets.some((secret) => content.includes(Buffer.from(secret))) ||
    signatures.some((pattern) => pattern.test(content.toString("utf8")))
  ) {
    console.error(`Credential found in ${location}:`, file);
    failed = true;
  }
}
let failed = false;
for (const file of new Set(files)) {
  if (/(^|\/)\.env($|\.)/.test(file) && !file.endsWith(".env.example")) {
    console.error("Sensitive environment file is a commit candidate:", file);
    failed = true;
    continue;
  }
  if (stagedFiles.has(file)) {
    try {
      inspect(file, execFileSync("git", ["show", `:${file}`], { maxBuffer: 16 * 1024 * 1024 }), "Git index");
    } catch {
      console.error("Unable to inspect staged file:", file);
      failed = true;
    }
  }
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue;
  }
  inspect(file, content, "working tree");
}
if (failed) process.exitCode = 1;
else
  console.log(
    `PASS: ${new Set(files).size} commit candidates passed working-tree/index checks for configured secrets, known credential patterns and private env files.`,
  );
