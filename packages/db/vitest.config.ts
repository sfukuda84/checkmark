import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "db", include: ["tests/**/*.test.ts"], environment: "node", fileParallelism: false },
});
