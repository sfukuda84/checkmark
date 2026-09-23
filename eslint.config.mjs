import { createRequire } from "node:module";
import tseslint from "typescript-eslint";
import globals from "globals";

// eslint-config-next は apps/web の依存なので、そこから解決する。
const requireFromWeb = createRequire(new URL("./apps/web/package.json", import.meta.url));
const nextCoreWebVitals = requireFromWeb("eslint-config-next/core-web-vitals");
const nextTypescript = requireFromWeb("eslint-config-next/typescript");

const toArray = (c) => (Array.isArray(c) ? c : [c]);

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/.mail-outbox/**",
      "packages/db/migrations/**",
      ".worktrees/**",
      "skills/**",
      ".claude/**",
      ".agents/**",
      ".kiro/**",
      ".specify/**",
      ".opencode/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "error",
    },
  },
  ...toArray(nextCoreWebVitals).map((c) => ({ ...c, files: ["apps/web/**/*.{ts,tsx}"] })),
  ...toArray(nextTypescript).map((c) => ({ ...c, files: ["apps/web/**/*.{ts,tsx}"] })),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    // eslint-plugin-react の版の自動検出は ESLint 10 で動かないため、版を明示する。
    settings: { next: { rootDir: "apps/web" }, react: { version: "19.2" } },
  },
  {
    // テストでは、HTTP の応答の JSON を any で扱ってよい。
    files: ["**/tests/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["**/scripts/**/*.{ts,mjs}", "**/*.config.{ts,mjs}"],
    rules: { "no-console": "off" },
  },
);
