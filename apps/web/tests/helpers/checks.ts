import { appSettings, checkCandidates, checks, SETTING_KEYS, usageCounters, user } from "@app/db";
import type { CheckJobSender } from "@/checks/jobs";
import { testDb } from "./db";

export async function addUser(id: string, role: "user" | "operator" = "user") {
  await testDb()
    .insert(user)
    .values({ id, email: `${id}@example.com`, emailVerified: true, role })
    .onConflictDoNothing();
}

/** 送ったジョブを記録する送信者。fail に入れた候補の番号（0 始まり）は失敗させる。 */
export function recordingSender(fail: number[] = []) {
  const sent: { candidateId: string; attempt: number }[] = [];
  let n = 0;
  const sender: CheckJobSender = {
    async send(candidateId, attempt) {
      const index = n++;
      if (fail.includes(index)) throw new Error("queue down");
      sent.push({ candidateId, attempt });
    },
  };
  return { sender, sent };
}

export async function setUsed(userId: string, period: string, used: number) {
  await testDb()
    .insert(usageCounters)
    .values({ userId, period, used })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period],
      set: { used },
    });
}

export async function setLimit(limit: number) {
  await testDb()
    .insert(appSettings)
    .values({ key: SETTING_KEYS.monthlyCandidateLimit, value: limit })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: limit } });
}

/** 状態を指定して、チェックと候補を直接作る。 */
export async function insertCheck(
  userId: string,
  statuses: ("queued" | "running" | "done" | "unknown")[],
  createdAt = new Date(),
) {
  const [c] = await testDb().insert(checks).values({ userId, createdAt }).returning();
  const cands = await testDb()
    .insert(checkCandidates)
    .values(
      statuses.map((status, i) => ({
        checkId: c!.id,
        position: i,
        inputText: `候補${i}`,
        normalizedText: `候補${i}`,
        status,
        deadlineAt: new Date(createdAt.getTime() + 120_000),
        charged: status !== "unknown",
        chargedPeriod: "2026-09",
      })),
    )
    .returning();
  return { check: c!, candidates: cands };
}
