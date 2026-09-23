import {
  and,
  appSettings,
  checkCandidates,
  checks,
  eq,
  inArray,
  nextPeriodStart,
  periodOf,
  SETTING_KEYS,
  sql,
  usageCounters,
  type DbOrTx,
} from "@app/db";

/** 利用回数の上限（FR-025〜FR-029、FR-027a、research R6）。 */

export const DEFAULT_MONTHLY_LIMIT = 50;
export const MAX_RUNNING_CHECKS = 3;

export interface UsageSummary {
  limit: number;
  used: number;
  remaining: number;
  period: string;
  resetsAt: Date;
}

/** 設定値が 0 以上の整数ならそれを使う。そうでなければ既定の 50。 */
export function parseLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : DEFAULT_MONTHLY_LIMIT;
}

export function summarizeUsage(input: { limit: number; used: number; at: Date }): UsageSummary {
  return {
    limit: input.limit,
    used: input.used,
    remaining: Math.max(0, input.limit - input.used),
    period: periodOf(input.at),
    resetsAt: nextPeriodStart(input.at),
  };
}

export async function getMonthlyLimit(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SETTING_KEYS.monthlyCandidateLimit));
  return parseLimit(row?.value);
}

export async function getUsed(db: DbOrTx, userId: string, period: string): Promise<number> {
  const [row] = await db
    .select({ used: usageCounters.used })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period)));
  return row?.used ?? 0;
}

export async function getUsageSummary(db: DbOrTx, userId: string, at: Date): Promise<UsageSummary> {
  const [limit, used] = await Promise.all([getMonthlyLimit(db), getUsed(db, userId, periodOf(at))]);
  return summarizeUsage({ limit, used, at });
}

/** 確認中（queued / running）の候補を持つチェックの数。 */
export async function countRunningChecks(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${checks.id})::int` })
    .from(checks)
    .innerJoin(checkCandidates, eq(checkCandidates.checkId, checks.id))
    .where(and(eq(checks.userId, userId), inArray(checkCandidates.status, ["queued", "running"])));
  return row?.n ?? 0;
}
