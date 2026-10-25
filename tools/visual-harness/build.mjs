// Bundles the visual harness (tools/visual-harness/main.ts) for the browser.
// esbuild ships with tsx (a dev dependency), so no extra install is needed.
import { build } from "esbuild";

await build({
  entryPoints: ["tools/visual-harness/main.ts"],
  bundle: true,
  format: "esm",
  outfile: "tools/visual-harness/dist/bundle.js",
  tsconfig: "tsconfig.json",
  logLevel: "warning",
});
console.log("Built tools/visual-harness/dist/bundle.js");
