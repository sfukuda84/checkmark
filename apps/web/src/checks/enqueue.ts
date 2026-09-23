import { markCandidateUnknown, type Database } from "@app/db";
import { errorKind } from "@app/shared/errors";
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
      { candidateId: input.candidateId, attempt: input.attempt, error: errorKind(err) },
      "照合のジョブを登録できなかった",
    );
    try {
      await markCandidateUnknown(db, { ...input, errorCode: "FAILED" });
    } catch (e) {
      // DB も止まっているときは握る。期限切れの処理（expire-trademark-checks）が 2 分後に「不明」にして利用回数を戻す。
      logger.error({ candidateId: input.candidateId, error: errorKind(e) }, "候補を「不明」にできなかった");
    }
  }
}
