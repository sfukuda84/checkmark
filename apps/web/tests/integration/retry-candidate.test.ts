import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkCandidates, eq, trademarkResults, usageCounters } from "@app/db";
import { retryCandidate } from "@/checks/retry";
import { closeDb, resetDb, testDb } from "../helpers/db";
import { addUser, insertCheck, recordingSender, setUsed } from "../helpers/checks";

const now = new Date("2026-09-23T03:00:00Z");
const candidateOf = async (id: string) =>
  (await testDb().select().from(checkCandidates).where(eq(checkCandidates.id, id)))[0]!;
const used = async () =>
  (await testDb().select().from(usageCounters).where(eq(usageCounters.userId, "u1")))[0]?.used ?? 0;

describe("retryCandidate（FR-024、FR-026a、contracts/server-actions.md）", () => {
  beforeEach(async () => {
    await resetDb();
    await addUser("u1");
  });
  afterAll(closeDb);

  it("unknown の候補を queued に戻し、回数を増やし、期限を延ばし、利用回数を 1 数えてジョブを送る", async () => {
    const { check, candidates } = await insertCheck("u1", ["done", "unknown"]);
    await testDb()
      .insert(trademarkResults)
      .values({ candidateId: candidates[1]!.id, outcome: "unknown", errorCode: "TIMEOUT" });
    await setUsed("u1", "2026-09", 1);
    const s = recordingSender();
    const r = await retryCandidate(testDb(), s.sender, { userId: "u1", candidateId: candidates[1]!.id, now });
    expect(r).toEqual({ ok: true, checkId: check.id });
    const c = await candidateOf(candidates[1]!.id);
    expect(c).toMatchObject({ status: "queued", attempt: 2, charged: true, chargedPeriod: "2026-09" });
    expect(c.deadlineAt.getTime()).toBe(now.getTime() + 120_000);
    expect(s.sent).toEqual([{ candidateId: candidates[1]!.id, attempt: 2 }]);
    expect(await used()).toBe(2);
    expect(
      await testDb().select().from(trademarkResults).where(eq(trademarkResults.candidateId, candidates[1]!.id)),
    ).toEqual([]);
  });

  it("結果が出ている候補と、確認中の候補は NOT_RETRYABLE", async () => {
    const { candidates } = await insertCheck("u1", ["done", "running"]);
    for (const c of candidates) {
      expect(
        await retryCandidate(testDb(), recordingSender().sender, { userId: "u1", candidateId: c.id, now }),
      ).toEqual({
        ok: false,
        error: "NOT_RETRYABLE",
      });
    }
  });

  it("残りがなければ QUOTA_EXCEEDED", async () => {
    const { candidates } = await insertCheck("u1", ["unknown"]);
    await setUsed("u1", "2026-09", 50);
    expect(
      await retryCandidate(testDb(), recordingSender().sender, { userId: "u1", candidateId: candidates[0]!.id, now }),
    ).toMatchObject({
      ok: false,
      error: "QUOTA_EXCEEDED",
      remaining: 0,
    });
  });

  it("ジョブを送れなければ unknown に戻し、数えた分を戻す", async () => {
    const { candidates } = await insertCheck("u1", ["unknown"]);
    await setUsed("u1", "2026-09", 0);
    const r = await retryCandidate(testDb(), recordingSender([0]).sender, {
      userId: "u1",
      candidateId: candidates[0]!.id,
      now,
    });
    expect(r).toMatchObject({ ok: true });
    expect((await candidateOf(candidates[0]!.id)).status).toBe("unknown");
    expect(await used()).toBe(0);
  });

  it("実行中のチェックが 3 件あれば TOO_MANY_RUNNING。対象のチェックが実行中なら数えない（FR-027a）", async () => {
    await insertCheck("u1", ["queued"]);
    await insertCheck("u1", ["running"]);
    const running = await insertCheck("u1", ["queued", "unknown"]);
    const finished = await insertCheck("u1", ["done", "unknown"]);
    await setUsed("u1", "2026-09", 0);
    expect(
      await retryCandidate(testDb(), recordingSender().sender, {
        userId: "u1",
        candidateId: finished.candidates[1]!.id,
        now,
      }),
    ).toEqual({ ok: false, error: "TOO_MANY_RUNNING" });
    expect(
      await retryCandidate(testDb(), recordingSender().sender, {
        userId: "u1",
        candidateId: running.candidates[1]!.id,
        now,
      }),
    ).toMatchObject({ ok: true });
  });

  it("存在しない候補は NOT_FOUND", async () => {
    expect(
      await retryCandidate(testDb(), recordingSender().sender, {
        userId: "u1",
        candidateId: "00000000-0000-0000-0000-000000000000",
        now,
      }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
