import { rm } from "node:fs/promises";
import { createDb } from "@app/db";
import { runMigrations } from "@app/db/migrate";
import { seedFixture } from "@app/importer/testing";
import { MAIL_OUTBOX_DIR } from "../../playwright.config";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
  await runMigrations(url);
  await rm(MAIL_OUTBOX_DIR, { recursive: true, force: true });
  // 一括チェックの照合に使う検証用の商標データ（001）。基準日は今日にする。
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await seedFixture(db, new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()));
  } finally {
    await pool.end();
  }
}
