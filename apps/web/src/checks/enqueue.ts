import { markCandidateUnknown, type Database } from "@app/db";
import type { Logger } from "@app/shared/logger";
import type { CheckJobSender } from "./jobs";

/** ジョブを送る。送れなかった候補は「不明」にして利用回数を戻す（research R6）。 */
export async function enqueueOrMarkUnknown(
  db: Database,
  sender: CheckJobSender,
  logger: Logger,
  input: { candidateId: string; attempt: number; now: Date },
): Promise<void> {
  try {
    await sender.send(input.candidateId, input.attempt);
  } catch (err) {
    logger.error(
      { candidateId: input.candidateId, attempt: input.attempt, error: err instanceof Error ? err.name : "unknown" },
      "照合のジョブを登録できなかった",
    );
    await markCandidateUnknown(db, { ...input, errorCode: "FAILED" });
  }
}

/** DB の例外の種類だけを返す。drizzle の例外はメッセージと params に問い合わせの値（候補名）を含むため、そのまま出さない（憲章 II）。 */
export function errorKind(err: unknown): { name: string; code: string | null } {
  if (!(err instanceof Error)) return { name: typeof err, code: null };
  const cause = (err as { cause?: { code?: unknown } }).cause;
  const code = (err as { code?: unknown }).code ?? cause?.code;
  return { name: err.name, code: typeof code === "string" ? code : null };
}
