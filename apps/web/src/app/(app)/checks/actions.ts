"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@app/db";
import { requireUser } from "@/auth/guards";
import { createPgBossCheckSender } from "@/checks/jobs";
import { formatDateTime } from "@/checks/presentation";
import { isUuid } from "@/checks/repository";
import { retryCandidate } from "@/checks/retry";
import { startCheck } from "@/checks/start-check";
import { getUsageSummary } from "@/checks/usage";
import { errorMessage, inputReasonMessage } from "@/lib/error-messages";

export interface StartCheckState {
  error: string | null;
  details: string[];
}

/** 一括チェックの実行（contracts/server-actions.md の startCheck）。 */
export async function startCheckAction(_prev: StartCheckState, form: FormData): Promise<StartCheckState> {
  const user = await requireUser();
  const now = new Date();
  const r = await startCheck(getDb(), createPgBossCheckSender(), {
    userId: user.id,
    input: String(form.get("candidates") ?? ""),
    classes: form.getAll("classes").map(String),
    now,
  });
  if (r.ok) redirect(r.merged > 0 ? `/checks/${r.checkId}?merged=${r.merged}` : `/checks/${r.checkId}`);
  switch (r.error) {
    case "INVALID_CANDIDATE":
      return {
        error: errorMessage(r.error),
        details: r.details.map((d) => `${d.line} 行目: ${inputReasonMessage(d.reason)}`),
      };
    case "QUOTA_EXCEEDED": {
      const usage = await getUsageSummary(getDb(), user.id, now);
      return {
        error: `${errorMessage(r.error)} 今月の残りは ${r.remaining} 件（上限 ${r.limit} 件）です。${formatDateTime(usage.resetsAt)} に戻ります。`,
        details: [],
      };
    }
    default:
      return { error: errorMessage(r.error), details: [] };
  }
}

/** 「不明」の候補のやり直し（contracts/server-actions.md の retryCandidate）。 */
export async function retryCandidateAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const checkId = String(form.get("checkId") ?? "");
  if (!isUuid(checkId)) notFound();
  const r = await retryCandidate(getDb(), createPgBossCheckSender(), {
    userId: user.id,
    candidateId: String(form.get("candidateId") ?? ""),
    now: new Date(),
  });
  if (!r.ok && r.error === "NOT_FOUND") notFound();
  revalidatePath(`/checks/${checkId}`);
  redirect(r.ok ? `/checks/${checkId}` : `/checks/${checkId}?retryError=${r.error}`);
}
