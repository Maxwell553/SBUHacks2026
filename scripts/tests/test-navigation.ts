import assert from "node:assert/strict";
import { safeNextPath } from "../../lib/shared/navigation";
for (const path of ["/studio", "/library", "/studio?q=printing%20press", "/privacy#rights"])
  assert.equal(safeNextPath(path), path);
for (const path of [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/\tevil.example",
  "/\nevil.example",
  "javascript:alert(1)",
  undefined,
  ["//evil.example"],
])
  assert.equal(safeNextPath(path), undefined);
console.log("PASS local navigation and external/backslash/control-character redirect rejection");
