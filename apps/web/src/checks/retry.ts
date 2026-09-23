import {
  and,
  chargeUsage,
  checkCandidates,
  checks,
  eq,
  lockUser,
  markCandidateUnknown,
  periodOf,
  trademarkResults,
  type Database,
} from "@app/db";
import { createLogger, type Logger } from "@app/shared/logger";
import type { CheckJobSender } from "./jobs";
import { isUuid } from "./repository";
import { CANDIDATE_DEADLINE_MS } from "./start-check";
import { getMonthlyLimit, getUsed } from "./usage";

/** 「不明」の候補のやり直し（FR-024、FR-026a、contracts/server-actions.md の retryCandidate）。 */

export type RetryResult =
  | { ok: true; checkId: string }
  | { ok: false; error: "NOT_FOUND" | "NOT_RETRYABLE" }
  | { ok: false; error: "QUOTA_EXCEEDED"; remaining: number; limit: number };

export async function retryCandidate(
  db: Database,
  sender: CheckJobSender,
  input: { userId: string; candidateId: string; now: Date; logger?: Logger },
): Promise<RetryResult> {
  const logger = input.logger ?? createLogger({ name: "retry-candidate" });
  if (!isUuid(input.candidateId)) return { ok: false, error: "NOT_FOUND" };
  const period = periodOf(input.now);

  const r = await db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [row] = await tx
      .select({ status: checkCandidates.status, attempt: checkCandidates.attempt, checkId: checks.id })
      .from(checkCandidates)
      .innerJoin(checks, eq(checks.id, checkCandidates.checkId))
      .where(and(eq(checkCandidates.id, input.candidateId), eq(checks.userId, input.userId)));
    if (!row) return { ok: false, error: "NOT_FOUND" } as const;
    if (row.status !== "unknown") return { ok: false, error: "NOT_RETRYABLE" } as const;
    const limit = await getMonthlyLimit(tx);
    const remaining = Math.max(0, limit - (await getUsed(tx, input.userId, period)));
    if (remaining < 1) return { ok: false, error: "QUOTA_EXCEEDED", remaining, limit } as const;

    const attempt = row.attempt + 1;
    await tx
      .update(checkCandidates)
      .set({
        status: "queued",
        attempt,
        deadlineAt: new Date(input.now.getTime() + CANDIDATE_DEADLINE_MS),
        charged: true,
        chargedPeriod: period,
      })
      .where(eq(checkCandidates.id, input.candidateId));
    await tx.delete(trademarkResults).where(eq(trademarkResults.candidateId, input.candidateId));
    await chargeUsage(tx, input.userId, period, 1);
    return { ok: true, checkId: row.checkId, attempt } as const;
  });
  if (!r.ok) return r;

  try {
    await sender.send(input.candidateId, r.attempt);
  } catch (err) {
    logger.error(
      { candidateId: input.candidateId, error: err instanceof Error ? err.name : "unknown" },
      "やり直しのジョブを登録できなかった",
    );
    await markCandidateUnknown(db, {
      candidateId: input.candidateId,
      attempt: r.attempt,
      errorCode: "FAILED",
      now: input.now,
    });
  }
  return { ok: true, checkId: r.checkId };
}
