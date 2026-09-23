import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "mail", include: ["tests/**/*.test.ts"], environment: "node" },
});
