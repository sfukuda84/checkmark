import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { checkCandidates, checks, trademarkResults, usageCounters, type TrademarkErrorCode } from "./schema";

/**
 * 利用回数を数える・戻す基本処理（001 research R6、FR-026、FR-026a）。
 * web（実行、やり直し、ジョブ登録の失敗）と worker（最後の試行の失敗、期限切れ）の両方から使う。
 */

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の暦月（YYYY-MM）。 */
export function periodOf(at: Date): string {
  const t = new Date(at.getTime() + TOKYO_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 次に利用回数が戻る日時（翌月 1 日 0 時、日本時間）。 */
export function nextPeriodStart(at: Date): Date {
  const t = new Date(at.getTime() + TOKYO_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1) - TOKYO_OFFSET_MS);
}

/** 利用者ごとに処理を直列にする（トランザクションの中で呼ぶ）。 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`checks:${userId}`}))`);
}

/** 期間の利用回数を n 件足す（行がなければ作る）。上限の確認は呼び出し側がロックの中で行う。 */
export async function chargeUsage(db: DbOrTx, userId: string, period: string, n: number): Promise<void> {
  if (n <= 0) return;
  await db
    .insert(usageCounters)
    .values({ userId, period, used: n })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period],
      set: { used: sql`${usageCounters.used} + ${n}` },
    });
}

/** 候補 1 件分の利用回数を戻す。charged を false にしてから引くので、二重には戻さない。戻したら true。 */
export async function refundCandidate(db: DbOrTx, candidateId: string): Promise<boolean> {
  const [row] = await db
    .update(checkCandidates)
    .set({ charged: false })
    .where(and(eq(checkCandidates.id, candidateId), eq(checkCandidates.charged, true)))
    .returning({ checkId: checkCandidates.checkId, period: checkCandidates.chargedPeriod });
  if (!row) return false;
  const [owner] = await db.select({ userId: checks.userId }).from(checks).where(eq(checks.id, row.checkId));
  if (!owner) return false;
  await db
    .update(usageCounters)
    .set({ used: sql`greatest(${usageCounters.used} - 1, 0)` })
    .where(and(eq(usageCounters.userId, owner.userId), eq(usageCounters.period, row.period)));
  return true;
}

/**
 * 未完了（queued / running）の候補を unknown にし、結果を書き、利用回数を戻す（FR-021、FR-026a）。
 * attempt を渡したときは、その回の実行のときだけ変える（古いジョブで上書きしない）。変えたら true。
 */
export async function markCandidateUnknown(
  db: DbOrTx,
  input: {
    candidateId: string;
    attempt?: number;
    errorCode: TrademarkErrorCode;
    now: Date;
    datasetAsOf?: string | null;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const conditions = [
      eq(checkCandidates.id, input.candidateId),
      inArray(checkCandidates.status, ["queued", "running"]),
    ];
    if (input.attempt !== undefined) conditions.push(eq(checkCandidates.attempt, input.attempt));
    const [changed] = await tx
      .update(checkCandidates)
      .set({ status: "unknown" })
      .where(and(...conditions))
      .returning({ id: checkCandidates.id });
    if (!changed) return false;
    const values = {
      outcome: "unknown" as const,
      matches: [],
      datasetAsOf: input.datasetAsOf ?? null,
      checkedAt: input.now,
      readingUnavailable: false,
      identicalOverflow: false,
      errorCode: input.errorCode,
    };
    await tx
      .insert(trademarkResults)
      .values({ candidateId: input.candidateId, ...values })
      .onConflictDoUpdate({ target: trademarkResults.candidateId, set: values });
    await refundCandidate(tx, input.candidateId);
    return true;
  });
}
