import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "worker", include: ["tests/**/*.test.ts"], environment: "node", fileParallelism: false },
});
