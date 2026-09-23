import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, eq, sql } from "../src";
import { checkCandidates, checks, trademarkResults, usageCounters, user } from "../src/schema";
import { chargeUsage, markCandidateUnknown, nextPeriodStart, periodOf, refundCandidate } from "../src/usage-ledger";

const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
const { db, pool } = createDb(url, { max: 2 });

async function seed(opts: { status?: "queued" | "running" | "done" | "unknown"; charged?: boolean } = {}) {
  await db.insert(user).values({ id: "u1", email: "u1@example.com", emailVerified: true });
  const [c] = await db.insert(checks).values({ userId: "u1" }).returning();
  const [cand] = await db
    .insert(checkCandidates)
    .values({
      checkId: c!.id,
      position: 0,
      inputText: "サクラ",
      normalizedText: "サクラ",
      status: opts.status ?? "running",
      deadlineAt: new Date(),
      charged: opts.charged ?? true,
      chargedPeriod: "2026-09",
    })
    .returning();
  await chargeUsage(db, "u1", "2026-09", 3);
  return cand!;
}

const used = async () => (await db.select().from(usageCounters).where(eq(usageCounters.userId, "u1")))[0]?.used;

describe("期間（research R6、FR-029）", () => {
  it("日本時間の暦月で数える", () => {
    expect(periodOf(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09");
    expect(periodOf(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10");
    expect(periodOf(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
  });

  it("次に戻る日時は翌月 1 日 0 時（日本時間）", () => {
    expect(nextPeriodStart(new Date("2026-09-23T03:00:00Z")).toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(nextPeriodStart(new Date("2026-12-10T00:00:00Z")).toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });
});

describe("利用回数の数え方と戻し（FR-026、FR-026a）", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table trademark_results, check_candidates, checks, usage_counters, "user" cascade`);
  });
  afterAll(() => pool.end());

  it("chargeUsage は期間の行を作り、足していく", async () => {
    await seed();
    await chargeUsage(db, "u1", "2026-09", 2);
    expect(await used()).toBe(5);
  });

  it("refundCandidate は 1 件戻し、二重には戻さない", async () => {
    const cand = await seed();
    expect(await refundCandidate(db, cand.id)).toBe(true);
    expect(await refundCandidate(db, cand.id)).toBe(false);
    expect(await used()).toBe(2);
    const [row] = await db.select().from(checkCandidates).where(eq(checkCandidates.id, cand.id));
    expect(row!.charged).toBe(false);
  });

  it("markCandidateUnknown は未完了の候補を unknown にして結果を書き、利用回数を戻す", async () => {
    const cand = await seed({ status: "running" });
    const changed = await markCandidateUnknown(db, { candidateId: cand.id, errorCode: "TIMEOUT", now: new Date() });
    expect(changed).toBe(true);
    const [row] = await db.select().from(checkCandidates).where(eq(checkCandidates.id, cand.id));
    expect(row!.status).toBe("unknown");
    const [res] = await db.select().from(trademarkResults).where(eq(trademarkResults.candidateId, cand.id));
    expect(res).toMatchObject({ outcome: "unknown", errorCode: "TIMEOUT", matches: [] });
    expect(await used()).toBe(2);
  });

  it("終わった候補と、attempt が違う候補は変えない", async () => {
    const done = await seed({ status: "done" });
    expect(await markCandidateUnknown(db, { candidateId: done.id, errorCode: "FAILED", now: new Date() })).toBe(false);
    await db.execute(sql`truncate table check_candidates, checks, usage_counters, "user" cascade`);
    const running = await seed({ status: "running" });
    expect(
      await markCandidateUnknown(db, { candidateId: running.id, attempt: 2, errorCode: "FAILED", now: new Date() }),
    ).toBe(false);
    expect(await used()).toBe(3);
  });
});
