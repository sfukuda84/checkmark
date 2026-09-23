import { rm } from "node:fs/promises";
import { runMigrations } from "@app/db/migrate";
import { MAIL_OUTBOX_DIR } from "../../playwright.config";

export default async function globalSetup() {
  await runMigrations(process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test");
  await rm(MAIL_OUTBOX_DIR, { recursive: true, force: true });
}
