import { createDb, sql, type Database } from "@app/db";

let handle: ReturnType<typeof createDb> | undefined;

/** テスト用 DB（app_test）への接続。マイグレーションは pnpm db:migrate で適用済みとする。 */
export function testDb(): Database {
  if (!handle) handle = createDb(process.env.DATABASE_URL!, { max: 4 });
  return handle.db;
}

/** テストごとに、アプリのテーブルを空にする。 */
export async function resetDb(): Promise<void> {
  await testDb().execute(sql`
    truncate table
      trademark_results, check_candidates, checks, usage_counters, app_settings,
      trademark_readings, trademark_marks, trademark_datasets,
      auth_events, consents, outbound_emails, rate_limit_buckets, rate_limit,
      verification, account, session, "user"
    restart identity cascade
  `);
}

export async function closeDb(): Promise<void> {
  await handle?.pool.end();
  handle = undefined;
}
