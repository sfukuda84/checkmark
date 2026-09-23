import {
  and,
  chargeUsage,
  checkCandidates,
  checks,
  eq,
  lockUser,
  periodOf,
  trademarkResults,
  type Database,
} from "@app/db";
import { createLogger, type Logger } from "@app/shared/logger";
import { errorKind } from "@app/shared/errors";
import { enqueueOrMarkUnknown } from "./enqueue";
import type { CheckJobSender } from "./jobs";
import { isUuid } from "./repository";
import { CANDIDATE_DEADLINE_MS } from "./start-check";
import { countRunningChecks, MAX_RUNNING_CHECKS, remainingQuota } from "./usage";

/** 「不明」の候補のやり直し（FR-024、FR-026a、FR-027a、contracts/server-actions.md の retryCandidate）。 */

export type RetryResult =
  | { ok: true; checkId: string }
  | { ok: false; error: "NOT_FOUND" | "NOT_RETRYABLE" | "TOO_MANY_RUNNING" | "FAILED" }
  | { ok: false; error: "QUOTA_EXCEEDED"; remaining: number; limit: number };

export async function retryCandidate(
  db: Database,
  sender: CheckJobSender,
  input: { userId: string; candidateId: string; now: Date; logger?: Logger },
): Promise<RetryResult> {
  const logger = input.logger ?? createLogger({ name: "retry-candidate" });
  if (!isUuid(input.candidateId)) return { ok: false, error: "NOT_FOUND" };
  const period = periodOf(input.now);

  let r;
  try {
    r = await db.transaction(async (tx) => {
      await lockUser(tx, input.userId);
      const [row] = await tx
        .select({ status: checkCandidates.status, attempt: checkCandidates.attempt, checkId: checks.id })
        .from(checkCandidates)
        .innerJoin(checks, eq(checks.id, checkCandidates.checkId))
        .where(and(eq(checkCandidates.id, input.candidateId), eq(checks.userId, input.userId)));
      if (!row) return { ok: false, error: "NOT_FOUND" } as const;
      if (row.status !== "unknown") return { ok: false, error: "NOT_RETRYABLE" } as const;
      // やり直しで実行中のチェックが 4 件以上にならないようにする。対象のチェックがすでに実行中なら数えない。
      if ((await countRunningChecks(tx, input.userId, row.checkId)) >= MAX_RUNNING_CHECKS) {
        return { ok: false, error: "TOO_MANY_RUNNING" } as const;
      }
      const { remaining, limit } = await remainingQuota(tx, input.userId, period);
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
  } catch (err) {
    logger.error({ candidateId: input.candidateId, error: errorKind(err) }, "やり直しを受け付けられなかった");
    return { ok: false, error: "FAILED" };
  }
  if (!r.ok) return r;

  await enqueueOrMarkUnknown(db, sender, logger, {
    candidateId: input.candidateId,
    attempt: r.attempt,
    now: input.now,
  });
  return { ok: true, checkId: r.checkId };
}
