import { chargeUsage, checkCandidates, checks, lockUser, periodOf, type Database } from "@app/db";
import { createLogger, type Logger } from "@app/shared/logger";
import { isTrademarkClass, MAX_CANDIDATES, parseCandidateInput, type InputError } from "@app/trademark";
import { enqueueOrMarkUnknown, errorKind } from "./enqueue";
import type { CheckJobSender } from "./jobs";
import { countRunningChecks, MAX_RUNNING_CHECKS, remainingQuota } from "./usage";

/** 一括チェックの実行（contracts/server-actions.md の startCheck）。 */

export const CANDIDATE_DEADLINE_MS = 2 * 60_000;
/** 解析の前に確かめる入力の大きさの上限（10 件 × 最大 101 文字に余裕を持たせる）。 */
export const MAX_INPUT_LENGTH = 5_000;
export const MAX_INPUT_LINES = 100;
const MAX_ERROR_DETAILS = 20;

export type StartCheckResult =
  | { ok: true; checkId: string; merged: number }
  | { ok: false; error: "NO_CANDIDATES" | "INVALID_CLASS" | "TOO_MANY_RUNNING" | "FAILED" }
  | { ok: false; error: "TOO_MANY_CANDIDATES"; limit: number }
  | { ok: false; error: "INVALID_CANDIDATE"; details: InputError[] }
  | { ok: false; error: "QUOTA_EXCEEDED"; remaining: number; limit: number };

export interface StartCheckInput {
  userId: string;
  input: string;
  classes: string[];
  now: Date;
  logger?: Logger;
}

function parseClasses(values: string[]): number[] | null {
  const out = new Set<number>();
  for (const v of values) {
    if (!/^\d{1,2}$/.test(v)) return null;
    const n = Number(v);
    if (!isTrademarkClass(n)) return null;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export async function startCheck(
  db: Database,
  sender: CheckJobSender,
  input: StartCheckInput,
): Promise<StartCheckResult> {
  const logger = input.logger ?? createLogger({ name: "start-check" });
  const lines = input.input.split(/\r?\n/).filter((l) => l.trim() !== "").length;
  if (input.input.length > MAX_INPUT_LENGTH || lines > MAX_INPUT_LINES) {
    return { ok: false, error: "TOO_MANY_CANDIDATES", limit: MAX_CANDIDATES };
  }
  const parsed = parseCandidateInput(input.input);
  if (parsed.errors.length > 0) {
    return { ok: false, error: "INVALID_CANDIDATE", details: parsed.errors.slice(0, MAX_ERROR_DETAILS) };
  }
  if (parsed.candidates.length === 0) return { ok: false, error: "NO_CANDIDATES" };
  if (parsed.candidates.length > MAX_CANDIDATES)
    return { ok: false, error: "TOO_MANY_CANDIDATES", limit: MAX_CANDIDATES };
  const classes = parseClasses(input.classes);
  if (!classes) return { ok: false, error: "INVALID_CLASS" };

  const period = periodOf(input.now);
  const deadlineAt = new Date(input.now.getTime() + CANDIDATE_DEADLINE_MS);
  const n = parsed.candidates.length;

  let created;
  try {
    created = await db.transaction(async (tx) => {
      await lockUser(tx, input.userId);
      if ((await countRunningChecks(tx, input.userId)) >= MAX_RUNNING_CHECKS) {
        return { ok: false, error: "TOO_MANY_RUNNING" } as const;
      }
      const { remaining, limit } = await remainingQuota(tx, input.userId, period);
      if (n > remaining) return { ok: false, error: "QUOTA_EXCEEDED", remaining, limit } as const;

      const [check] = await tx
        .insert(checks)
        .values({ userId: input.userId, classes, createdAt: input.now })
        .returning({ id: checks.id });
      const rows = await tx
        .insert(checkCandidates)
        .values(
          parsed.candidates.map((c, position) => ({
            checkId: check!.id,
            position,
            inputText: c.inputText,
            userReading: c.userReading,
            normalizedText: c.normalizedText,
            status: "queued" as const,
            deadlineAt,
            charged: true,
            chargedPeriod: period,
          })),
        )
        .returning({ id: checkCandidates.id, position: checkCandidates.position });
      await chargeUsage(tx, input.userId, period, n);
      const candidateIds = rows.sort((a, b) => a.position - b.position).map((r) => r.id);
      return { ok: true, checkId: check!.id, candidateIds } as const;
    });
  } catch (err) {
    // 例外をそのまま外へ出すと、候補名を含む問い合わせの値が Next.js のログに出る（憲章 II）。
    logger.error({ error: errorKind(err) }, "一括チェックを受け付けられなかった");
    return { ok: false, error: "FAILED" };
  }
  if (!created.ok) return created;

  // ジョブの登録はコミットの後に行う。
  for (const candidateId of created.candidateIds) {
    await enqueueOrMarkUnknown(db, sender, logger, { candidateId, attempt: 1, now: input.now });
  }
  logger.info({ checkId: created.checkId, candidateCount: n, merged: parsed.merged }, "一括チェックを受け付けた");
  return { ok: true, checkId: created.checkId, merged: parsed.merged };
}
