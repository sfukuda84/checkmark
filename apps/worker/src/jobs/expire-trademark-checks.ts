import { and, checkCandidates, inArray, lt, markCandidateUnknown, type Database } from "@app/db";

/** 期限（実行から 2 分）を過ぎても終わらない候補を「不明」にし、利用回数を戻す（FR-021、research R5）。変えた件数を返す。 */
export async function expireTrademarkChecks(db: Database, now: Date): Promise<number> {
  const stale = await db
    .select({ id: checkCandidates.id, attempt: checkCandidates.attempt })
    .from(checkCandidates)
    .where(and(inArray(checkCandidates.status, ["queued", "running"]), lt(checkCandidates.deadlineAt, now)))
    .limit(500);
  let changed = 0;
  for (const c of stale) {
    if (await markCandidateUnknown(db, { candidateId: c.id, attempt: c.attempt, errorCode: "TIMEOUT", now }))
      changed += 1;
  }
  return changed;
}
