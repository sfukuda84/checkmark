import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "trademark", include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 20_000 },
});
