import { defineConfig } from "vitest/config";

// 各パッケージの vitest.config.ts を束ねる（Vitest 5 の projects）。
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
