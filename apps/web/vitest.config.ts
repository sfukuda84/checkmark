import path from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    name: "web",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // 結合テストは同じテスト用 DB を使うので、ファイルを直列に実行する。
    fileParallelism: false,
    setupFiles: ["tests/helpers/setup-env.ts"],
    testTimeout: 20_000,
  },
});
