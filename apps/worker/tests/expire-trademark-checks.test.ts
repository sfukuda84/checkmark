import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkCandidates, eq, trademarkResults, usageCounters } from "@app/db";
import { expireTrademarkChecks } from "../src/jobs/expire-trademark-checks";
import { handleTrademarkCheck } from "../src/jobs/trademark-check";
import { createPgTrademarkSource } from "../src/jobs/pg-trademark-source";
import { captureLogger, createCheck, db, handle, resetChecks } from "./helpers";

const now = new Date("2026-09-23T03:00:00Z");
const statusOf = async (id: string) =>
  (await db.select().from(checkCandidates).where(eq(checkCandidates.id, id)))[0]!.status;

describe("expire-trademark-checks（FR-021、research R5）", () => {
  beforeEach(resetChecks);
  afterAll(() => handle.pool.end());

  it("期限（2 分）を過ぎた queued と running の候補を unknown（TIMEOUT）にし、利用回数を戻す", async () => {
    const past = new Date(now.getTime() - 1);
    const { candidates } = await createCheck([{ text: "ア" }, { text: "イ" }], { deadlineAt: past });
    await db.update(checkCandidates).set({ status: "running" }).where(eq(checkCandidates.id, candidates[1]!.id));
    const { candidates: fresh } = await createCheck([{ text: "ウ" }], { deadlineAt: new Date(now.getTime() + 60_000) });

    expect(await expireTrademarkChecks(db, now)).toBe(2);
    expect(await statusOf(candidates[0]!.id)).toBe("unknown");
    expect(await statusOf(candidates[1]!.id)).toBe("unknown");
    expect(await statusOf(fresh[0]!.id)).toBe("queued");
    const [res] = await db.select().from(trademarkResults).where(eq(trademarkResults.candidateId, candidates[0]!.id));
    expect(res).toMatchObject({ outcome: "unknown", errorCode: "TIMEOUT" });
    const [usage] = await db.select().from(usageCounters).where(eq(usageCounters.userId, "u1"));
    expect(usage!.used).toBe(1);
  });

  it("終わった候補は変えない", async () => {
    const { candidates } = await createCheck([{ text: "ア" }], { deadlineAt: new Date(now.getTime() - 1) });
    await db.update(checkCandidates).set({ status: "done" }).where(eq(checkCandidates.id, candidates[0]!.id));
    expect(await expireTrademarkChecks(db, now)).toBe(0);
    expect(await statusOf(candidates[0]!.id)).toBe("done");
  });

  it("期限切れの後に来た照合の結果は捨てる", async () => {
    const { candidates } = await createCheck([{ text: "ア" }], { deadlineAt: new Date(now.getTime() - 1) });
    await expireTrademarkChecks(db, now);
    await handleTrademarkCheck(
      { db, source: createPgTrademarkSource(db), tokenize: async () => [], logger: captureLogger().logger },
      { data: { candidateId: candidates[0]!.id, attempt: 1 }, retryCount: 0, retryLimit: 1 },
    );
    expect(await statusOf(candidates[0]!.id)).toBe("unknown");
    const [res] = await db.select().from(trademarkResults).where(eq(trademarkResults.candidateId, candidates[0]!.id));
    expect(res!.errorCode).toBe("TIMEOUT");
  });
});
