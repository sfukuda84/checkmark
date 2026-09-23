import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "importer", include: ["tests/**/*.test.ts"], environment: "node", fileParallelism: false },
});
