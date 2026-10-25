import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Node CLI scripts run outside the Next.js bundle.
    files: ["scripts/**"],
    rules: {
      "@next/next/no-assign-module-variable": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    ".builds/**",
    "tmp/**",
    "tools/visual-harness/dist/**",
    "work/**",
    "outputs/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/lowpoly/landmask.ts",
  ]),
]);
