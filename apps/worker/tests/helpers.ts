import { Writable } from "node:stream";
import { checkCandidates, checks, createDb, sql, usageCounters, user } from "@app/db";
import { createLogger } from "@app/shared/logger";
import { normalizeText } from "@app/trademark";

export const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
export const handle = createDb(url, { max: 4 });
export const db = handle.db;

export async function resetAll(): Promise<void> {
  await db.execute(sql`
    truncate table trademark_results, check_candidates, checks, usage_counters, app_settings,
      trademark_readings, trademark_marks, trademark_datasets, "user" cascade
  `);
}

export async function resetChecks(): Promise<void> {
  await db.execute(sql`truncate table trademark_results, check_candidates, checks, usage_counters, "user" cascade`);
}

/** 利用者とチェックを作り、候補を queued で入れる。利用回数も候補数だけ数えておく。 */
export async function createCheck(
  inputs: { text: string; reading?: string | null }[],
  opts: { userId?: string; classes?: number[]; deadlineAt?: Date; period?: string } = {},
) {
  const userId = opts.userId ?? "u1";
  await db
    .insert(user)
    .values({ id: userId, email: `${userId}@example.com`, emailVerified: true })
    .onConflictDoNothing();
  const [check] = await db
    .insert(checks)
    .values({ userId, classes: opts.classes ?? [] })
    .returning();
  const period = opts.period ?? "2026-09";
  const candidates = await db
    .insert(checkCandidates)
    .values(
      inputs.map((c, i) => ({
        checkId: check!.id,
        position: i,
        inputText: c.text,
        userReading: c.reading ?? null,
        normalizedText: normalizeText(c.text),
        deadlineAt: opts.deadlineAt ?? new Date(Date.now() + 120_000),
        charged: true,
        chargedPeriod: period,
      })),
    )
    .returning();
  await db
    .insert(usageCounters)
    .values({ userId, period, used: inputs.length })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period],
      set: { used: sql`${usageCounters.used} + ${inputs.length}` },
    });
  return { check: check!, candidates };
}

/** ログを取り込む logger。 */
export function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { logger: createLogger({ level: "debug", destination: stream }), lines };
}
