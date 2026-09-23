import { and, asc, checkCandidates, checks, desc, eq, sql, trademarkResults, type Database } from "@app/db";

/** チェックの読み出し。すべて本人（user_id）に限る（FR-030、research R9）。 */

export type CandidateRow = typeof checkCandidates.$inferSelect;
export type ResultRow = typeof trademarkResults.$inferSelect;
export type CheckRow = typeof checks.$inferSelect;

export interface CandidateView extends CandidateRow {
  result: ResultRow | null;
}

export interface OwnedCheck {
  check: CheckRow;
  candidates: CandidateView[];
  total: number;
  completed: number;
  running: boolean;
}

export interface RecentCheck {
  id: string;
  createdAt: Date;
  total: number;
  completed: number;
  running: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

const isFinished = (status: CandidateRow["status"]) => status === "done" || status === "unknown";

export async function findOwnedCheck(db: Database, userId: string, checkId: string): Promise<OwnedCheck | null> {
  if (!isUuid(checkId)) return null;
  const [check] = await db
    .select()
    .from(checks)
    .where(and(eq(checks.id, checkId), eq(checks.userId, userId)));
  if (!check) return null;
  const rows = await db
    .select({ candidate: checkCandidates, result: trademarkResults })
    .from(checkCandidates)
    .leftJoin(trademarkResults, eq(trademarkResults.candidateId, checkCandidates.id))
    .where(eq(checkCandidates.checkId, check.id))
    .orderBy(asc(checkCandidates.position));
  const candidates = rows.map((r) => ({ ...r.candidate, result: r.result }));
  const completed = candidates.filter((c) => isFinished(c.status)).length;
  return { check, candidates, total: candidates.length, completed, running: completed < candidates.length };
}

export async function listRecentChecks(db: Database, userId: string, limit = 5): Promise<RecentCheck[]> {
  const rows = await db
    .select({
      id: checks.id,
      createdAt: checks.createdAt,
      total: sql<number>`count(${checkCandidates.id})::int`,
      completed: sql<number>`count(${checkCandidates.id}) filter (where ${checkCandidates.status} in ('done', 'unknown'))::int`,
    })
    .from(checks)
    .innerJoin(checkCandidates, eq(checkCandidates.checkId, checks.id))
    .where(eq(checks.userId, userId))
    .groupBy(checks.id)
    .orderBy(desc(checks.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, running: r.completed < r.total }));
}
