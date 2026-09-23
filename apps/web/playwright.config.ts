import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
export const MAIL_OUTBOX_DIR = path.resolve(import.meta.dirname, "test-results/mail-outbox");

const env = {
  DATABASE_URL,
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-012345",
  BETTER_AUTH_URL: BASE_URL,
  MAIL_TRANSPORT: "file",
  MAIL_OUTBOX_DIR,
  PWNED_CHECK: "static",
  TRUSTED_PROXY_IPS: "127.0.0.1",
  SUPPORT_CONTACT: "support@example.com",
  LOG_LEVEL: "warn",
  PORT: String(PORT),
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: BASE_URL, trace: "retain-on-failure", locale: "ja-JP" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // output: "standalone" のため、standalone の server.js で起動する。静的ファイルは自分で置く。
      command:
        "pnpm exec next build && rm -rf .next/standalone/apps/web/.next/static && cp -r .next/static .next/standalone/apps/web/.next/static && node .next/standalone/apps/web/server.js",
      url: `${BASE_URL}/sign-in`,
      env: { ...env, NODE_ENV: "production", HOSTNAME: "127.0.0.1" },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "pnpm --filter @app/worker start",
      env: { ...env, NODE_ENV: "production", LOG_LEVEL: "info" },
      reuseExistingServer: !process.env.CI,
      // worker は HTTP を公開しないので、起動のログで待つ。
      wait: { stdout: /worker を起動した/ },
      timeout: 60_000,
    },
  ],
});
