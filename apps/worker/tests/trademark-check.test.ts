import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkCandidates, eq, trademarkResults, usageCounters, user } from "@app/db";
import { seedFixture } from "@app/importer/testing";
import { createKuromojiTokenizer } from "@app/trademark/reading";
import type { TrademarkSource } from "@app/trademark";
import { handleTrademarkCheck, type TrademarkCheckDeps } from "../src/jobs/trademark-check";
import { createPgTrademarkSource } from "../src/jobs/pg-trademark-source";
import { captureLogger, createCheck, db, handle, resetAll, resetChecks } from "./helpers";

const tokenizer = createKuromojiTokenizer();
const source = createPgTrademarkSource(db);
const now = new Date("2026-09-23T03:00:00Z");

function deps(over: Partial<TrademarkCheckDeps> = {}): TrademarkCheckDeps {
  return { db, source, tokenize: tokenizer.tokenize, logger: captureLogger().logger, now: () => now, ...over };
}

async function run(
  candidateId: string,
  over: Partial<TrademarkCheckDeps> = {},
  job = { attempt: 1, retryCount: 0, retryLimit: 1 },
) {
  await handleTrademarkCheck(deps(over), {
    data: { candidateId, attempt: job.attempt },
    retryCount: job.retryCount,
    retryLimit: job.retryLimit,
  });
}

const resultOf = async (id: string) =>
  (await db.select().from(trademarkResults).where(eq(trademarkResults.candidateId, id)))[0];
const candidateOf = async (id: string) =>
  (await db.select().from(checkCandidates).where(eq(checkCandidates.id, id)))[0];
const usedOf = async () => (await db.select().from(usageCounters).where(eq(usageCounters.userId, "u1")))[0]?.used;

/** 1 件の候補を照合して結果を返す。 */
async function check(text: string, opts: { reading?: string; classes?: number[] } = {}) {
  const { candidates } = await createCheck([{ text, reading: opts.reading ?? null }], { classes: opts.classes ?? [] });
  await run(candidates[0]!.id);
  return { result: (await resultOf(candidates[0]!.id))!, candidate: (await candidateOf(candidates[0]!.id))! };
}

describe("trademark-check（contracts/jobs-and-cli.md §2）", () => {
  beforeAll(async () => {
    await resetAll();
    await seedFixture(db, "2026-09-20");
  });
  beforeEach(resetChecks);
  afterAll(async () => {
    tokenizer.release();
    await handle.pool.end();
  });

  it("同じ文字の商標があれば identical にし、写しと基準日を保存して done にする", async () => {
    const { result, candidate } = await check("さくらのみち");
    expect(candidate).toMatchObject({ status: "done", reading: "サクラノミチ", readingEstimated: false });
    expect(result).toMatchObject({ outcome: "identical", datasetAsOf: "2026-09-20", errorCode: null });
    expect(result.checkedAt.toISOString()).toBe(now.toISOString());
    expect(result.matches[0]).toMatchObject({
      kind: "identical",
      applicationNumber: "2020-000001",
      registrationNumber: "6000001",
      markText: "サクラノミチ",
      holderName: "検証用食品株式会社",
      classes: [30, 43],
      status: "registered",
    });
    expect(result.matches.map((m) => m.applicationNumber)).toContain("2020-000002");
  });

  it("読みが似た商標だけがあれば similar にする", async () => {
    const { result } = await check("ソラマメ");
    expect(result.outcome).toBe("similar");
    expect(result.matches[0]).toMatchObject({
      kind: "similar",
      applicationNumber: "2020-000003",
      reading: "ソラマミ",
      status: "pending",
    });
  });

  it("該当がなければ none にする。消滅した商標は該当にしない（FR-010a）", async () => {
    expect((await check("キエタショウヒョウ")).result.outcome).toBe("none");
  });

  it("区分を選んだら、そのいずれかを含む商標だけを該当にする（FR-010）", async () => {
    const { result } = await check("ミライデンキ", { classes: [9] });
    expect(result.matches.map((m) => m.applicationNumber)).toEqual(["2020-000004"]);
    expect((await check("サクラノミチ", { classes: [9] })).result.outcome).toBe("none");
  });

  it("読みを推定したときは、その読みと推定したことを記録する（FR-014）", async () => {
    const { candidate, result } = await check("星空");
    expect(candidate).toMatchObject({ reading: "ホシゾラ", readingEstimated: true });
    expect(result.matches.map((m) => [m.kind, m.applicationNumber])).toEqual([
      ["identical", "2020-000020"],
      ["similar", "2020-000018"],
      ["similar", "2020-000019"],
    ]);
  });

  it("利用者が添えた読みで照合する", async () => {
    const { candidate, result } = await check("春風", { reading: "ハルカゼ" });
    expect(candidate).toMatchObject({ reading: "ハルカゼ", readingEstimated: false });
    expect(result.matches.map((m) => m.applicationNumber)).toContain("2020-000013");
  });

  it("読みが得られなければ、同一だけを判定し readingUnavailable を立てる", async () => {
    const { result, candidate } = await check("&&&");
    expect(candidate.reading).toBeNull();
    expect(result).toMatchObject({ outcome: "none", readingUnavailable: true });
  });

  it("SC-003: 検証用データの同一の組を 100% identical にする", async () => {
    const pairs: [string, string][] = [
      ["サクラノミチ", "2020-000001"],
      ["BlueMoon", "2020-000006"],
      ["山田商店", "2020-000007"],
      ["ことのは", "2020-000016"],
      ["星空", "2020-000020"],
      ["もみじ", "2020-000009"],
      ["ガルタ", "2020-000011"],
    ];
    for (const [text, id] of pairs) {
      await resetChecks();
      const { result } = await check(text);
      expect(result.outcome, text).toBe("identical");
      expect(
        result.matches.filter((m) => m.kind === "identical").map((m) => m.applicationNumber),
        text,
      ).toContain(id);
    }
  });

  it("SC-004: 検証用データの類似の組の 90% 以上を、類似の上位 20 件に示す", async () => {
    const pairs: [string, string][] = [
      ["サクラノミツ", "2020-000001"],
      ["ソラマメ", "2020-000003"],
      ["ミライテンキ", "2020-000004"],
      ["ミライテンキ", "2020-000005"],
      ["ブルームーンズ", "2020-000006"],
      ["ヤマダショーテン", "2020-000007"],
      ["カルタ", "2020-000011"],
      ["ソニーグ", "2020-000012"],
      ["ハルカゼ", "2020-000014"],
      ["ハルカゼ", "2020-000015"],
      ["コトノワ", "2020-000016"],
      ["ホシゾラ", "2020-000019"],
      ["キャラメルパンダ", "2020-000010"],
    ];
    let hits = 0;
    for (const [text, id] of pairs) {
      await resetChecks();
      const { result } = await check(text);
      if (result.matches.some((m) => m.kind === "similar" && m.applicationNumber === id)) hits += 1;
    }
    expect(hits / pairs.length).toBeGreaterThanOrEqual(0.9);
  });

  it("attempt が違うジョブと、終わった候補は何もしない", async () => {
    const { candidates } = await createCheck([{ text: "ソラマメ" }]);
    await run(candidates[0]!.id, {}, { attempt: 2, retryCount: 0, retryLimit: 1 });
    expect((await candidateOf(candidates[0]!.id))!.status).toBe("queued");
    await run(candidates[0]!.id);
    const first = await resultOf(candidates[0]!.id);
    await run(candidates[0]!.id);
    expect((await resultOf(candidates[0]!.id))!.checkedAt).toEqual(first!.checkedAt);
  });

  it("候補が消えていたら（退会・削除）何もせずに終える（FR-033）", async () => {
    const { candidates } = await createCheck([{ text: "ソラマメ" }]);
    await db.delete(user).where(eq(user.id, "u1"));
    await expect(run(candidates[0]!.id)).resolves.toBeUndefined();
    expect(await resultOf(candidates[0]!.id)).toBeUndefined();
  });

  it("商標データがなければ unknown（NO_DATASET）にして利用回数を戻す", async () => {
    const empty: TrademarkSource = { ...source, activeDataset: async () => null };
    const { candidates } = await createCheck([{ text: "ソラマメ" }, { text: "サクラ" }]);
    await run(candidates[0]!.id, { source: empty });
    expect(await resultOf(candidates[0]!.id)).toMatchObject({ outcome: "unknown", errorCode: "NO_DATASET" });
    expect(await usedOf()).toBe(1);
  });

  it("途中の試行で失敗したら例外を投げて再試行に回し、最後の試行で失敗したら unknown（FAILED）にして戻す", async () => {
    const broken: TrademarkSource = {
      ...source,
      findIdentical: async () => {
        throw new Error("db down");
      },
    };
    const { candidates } = await createCheck([{ text: "ソラマメ" }]);
    await expect(
      run(candidates[0]!.id, { source: broken }, { attempt: 1, retryCount: 0, retryLimit: 1 }),
    ).rejects.toThrow();
    expect((await candidateOf(candidates[0]!.id))!.status).toBe("running");
    await run(candidates[0]!.id, { source: broken }, { attempt: 1, retryCount: 1, retryLimit: 1 });
    expect(await resultOf(candidates[0]!.id)).toMatchObject({ outcome: "unknown", errorCode: "FAILED" });
    expect(await usedOf()).toBe(0);
  });

  it("SC-008: 一部の候補の照合が失敗しても、ほかの候補の結果は出る（FR-023）", async () => {
    const broken: TrademarkSource = {
      ...source,
      findIdentical: async () => {
        throw new Error("db down");
      },
    };
    const { candidates } = await createCheck([{ text: "ソラマメ" }, { text: "さくらのみち" }]);
    await run(candidates[0]!.id, { source: broken }, { attempt: 1, retryCount: 1, retryLimit: 1 });
    await run(candidates[1]!.id);
    expect((await candidateOf(candidates[0]!.id))!.status).toBe("unknown");
    expect(await resultOf(candidates[1]!.id)).toMatchObject({ outcome: "identical" });
  });

  it("1 回の試行が時間内に終わらなければ失敗として扱う", async () => {
    const slow: TrademarkSource = { ...source, findIdentical: () => new Promise(() => {}) };
    const { candidates } = await createCheck([{ text: "ソラマメ" }]);
    await run(candidates[0]!.id, { source: slow, timeoutMs: 50 }, { attempt: 1, retryCount: 1, retryLimit: 1 });
    expect(await resultOf(candidates[0]!.id)).toMatchObject({ outcome: "unknown", errorCode: "FAILED" });
  });

  it("ログに候補名、読み、商標の文字を出さない（FR-031、SC-006）", async () => {
    const { logger, lines } = captureLogger();
    const { candidates } = await createCheck([
      { text: "ヒミツノナマエ", reading: "ヒミツノナマエ" },
      { text: "さくらのみち" },
    ]);
    for (const c of candidates) await run(c.id, { logger });
    const out = lines.join("");
    expect(out).toContain(candidates[0]!.id);
    for (const secret of ["ヒミツノナマエ", "さくらのみち", "サクラノミチ", "サクマノミチ"])
      expect(out).not.toContain(secret);
  });

  it("SC-002: 検証用データで 1 候補の照合が 30 秒以内に終わる", async () => {
    const { candidates } = await createCheck([{ text: "未来電機" }]);
    const started = Date.now();
    await run(candidates[0]!.id);
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});
