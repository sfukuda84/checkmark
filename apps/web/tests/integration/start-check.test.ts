import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkCandidates, checks, eq, trademarkResults, usageCounters } from "@app/db";
import { startCheck } from "@/checks/start-check";
import { closeDb, resetDb, testDb } from "../helpers/db";
import { addUser, insertCheck, recordingSender, setLimit, setUsed } from "../helpers/checks";

const now = new Date("2026-09-23T03:00:00Z");
const used = async (userId = "u1", period = "2026-09") =>
  (await testDb().select().from(usageCounters).where(eq(usageCounters.userId, userId))).find((r) => r.period === period)
    ?.used ?? 0;

describe("startCheck（contracts/server-actions.md、FR-001〜FR-007、FR-025〜FR-029、FR-027a）", () => {
  beforeEach(async () => {
    await resetDb();
    await addUser("u1");
  });
  afterAll(closeDb);

  const run = (
    input: string,
    classes: string[] = [],
    opts: { sender?: ReturnType<typeof recordingSender>; at?: Date } = {},
  ) => {
    const s = opts.sender ?? recordingSender();
    return startCheck(testDb(), s.sender, { userId: "u1", input, classes, now: opts.at ?? now });
  };

  it("チェックと候補を作り、利用回数を数え、候補ごとにジョブを送る", async () => {
    const s = recordingSender();
    const r = await run("サクラ\nソラマメ / そらまめ\n\n", ["9", "3", "9"], { sender: s });
    expect(r).toMatchObject({ ok: true, merged: 0 });
    if (!r.ok) throw new Error();
    const [check] = await testDb().select().from(checks).where(eq(checks.id, r.checkId));
    expect(check).toMatchObject({ userId: "u1", classes: [3, 9] });
    const cands = await testDb()
      .select()
      .from(checkCandidates)
      .where(eq(checkCandidates.checkId, r.checkId))
      .orderBy(checkCandidates.position);
    expect(
      cands.map((c) => [
        c.position,
        c.inputText,
        c.normalizedText,
        c.userReading,
        c.status,
        c.attempt,
        c.charged,
        c.chargedPeriod,
      ]),
    ).toEqual([
      [0, "サクラ", "サクラ", null, "queued", 1, true, "2026-09"],
      [1, "ソラマメ", "ソラマメ", "ソラマメ", "queued", 1, true, "2026-09"],
    ]);
    expect(cands[0]!.deadlineAt.getTime() - now.getTime()).toBe(120_000);
    expect(s.sent).toEqual(cands.map((c) => ({ candidateId: c.id, attempt: 1 })));
    expect(await used()).toBe(2);
  });

  it("重複をまとめ、まとめた件数を返す。利用回数はまとめた後の件数で数える（FR-003、FR-026）", async () => {
    const r = await run("さくら\nサクラ\nソラ");
    expect(r).toMatchObject({ ok: true, merged: 1 });
    expect(await used()).toBe(2);
  });

  it("候補が 0 件なら NO_CANDIDATES", async () => {
    expect(await run(" \n\n")).toEqual({ ok: false, error: "NO_CANDIDATES" });
  });

  it("まとめた後で 10 件を超えたら TOO_MANY_CANDIDATES。10 件ちょうどは実行できる（FR-002）", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `コウホ${"アイウエオカキクケコサ"[i]}`).join("\n");
    expect(await run(eleven)).toMatchObject({ ok: false, error: "TOO_MANY_CANDIDATES", limit: 10 });
    const tenWithDup = eleven.split("\n").slice(0, 10).join("\n") + "\nこうほあ";
    expect(await run(tenWithDup)).toMatchObject({ ok: true, merged: 1 });
  });

  it("不正な候補があれば、行番号と理由を返して何も作らない（FR-004）", async () => {
    const r = await run("サクラ\n🌸\nソラ / sora");
    expect(r).toEqual({
      ok: false,
      error: "INVALID_CANDIDATE",
      details: [
        { line: 2, reason: "INVALID_CHARS" },
        { line: 3, reason: "INVALID_READING" },
      ],
    });
    expect(await testDb().select().from(checks)).toEqual([]);
  });

  it("不正な区分なら INVALID_CLASS", async () => {
    expect(await run("サクラ", ["46"])).toEqual({ ok: false, error: "INVALID_CLASS" });
    expect(await run("サクラ", ["abc"])).toEqual({ ok: false, error: "INVALID_CLASS" });
  });

  it("残りを超えるなら QUOTA_EXCEEDED を返し、残りと上限を示す（FR-027）", async () => {
    await setUsed("u1", "2026-09", 48);
    expect(await run("ア\nイ\nウ")).toEqual({ ok: false, error: "QUOTA_EXCEEDED", remaining: 2, limit: 50 });
    expect(await testDb().select().from(checks)).toEqual([]);
    expect(await run("ア\nイ")).toMatchObject({ ok: true });
    expect(await used()).toBe(50);
  });

  it("運営者が変えた上限値を使う（FR-025）", async () => {
    await setLimit(2);
    expect(await run("ア\nイ\nウ")).toMatchObject({ ok: false, error: "QUOTA_EXCEEDED", remaining: 2, limit: 2 });
  });

  it("実行を受け付けた時点の期間で数える（日本時間の月の変わり目）", async () => {
    await setUsed("u1", "2026-09", 50);
    const r = await run("ア", [], { at: new Date("2026-09-30T15:00:00Z") });
    expect(r).toMatchObject({ ok: true });
    expect(await used("u1", "2026-10")).toBe(1);
  });

  it("実行中のチェックが 3 件あれば TOO_MANY_RUNNING。終わったチェックは数えない（FR-027a）", async () => {
    await insertCheck("u1", ["queued"]);
    await insertCheck("u1", ["done", "running"]);
    await insertCheck("u1", ["done", "unknown"]);
    expect(await run("ア")).toMatchObject({ ok: true });
    expect(await run("イ")).toEqual({ ok: false, error: "TOO_MANY_RUNNING" });
  });

  it("同時に実行しても、合計が上限を超えない（SC-007）", async () => {
    await setLimit(15);
    const ten = (p: string) => Array.from({ length: 10 }, (_, i) => `${p}${"アイウエオカキクケコ"[i]}`).join("\n");
    const results = await Promise.all([run(ten("ア")), run(ten("イ")), run(ten("ウ"))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await used()).toBe(10);
  });

  it("DB の失敗は FAILED を返し、候補名を含む例外を外へ出さず、ログにも出さない（憲章 II）", async () => {
    const { Writable } = await import("node:stream");
    const { createLogger } = await import("@app/shared/logger");
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      destination: new Writable({
        write(c, _e, cb) {
          lines.push(c.toString());
          cb();
        },
      }),
    });
    const failing = {
      transaction: async () => {
        throw Object.assign(new Error("Failed query: insert ...\nparams: ヒミツノナマエ"), {
          params: ["ヒミツノナマエ"],
        });
      },
    } as unknown as Parameters<typeof startCheck>[0];
    const r = await startCheck(failing, recordingSender().sender, {
      userId: "u1",
      input: "ヒミツノナマエ",
      classes: [],
      now,
      logger,
    });
    expect(r).toEqual({ ok: false, error: "FAILED" });
    expect(lines.join("")).not.toContain("ヒミツノナマエ");
  });

  it("大きすぎる入力は解析する前に断り、行ごとのエラーは 20 件までにする", async () => {
    expect(await run(Array.from({ length: 101 }, () => "ア").join("\n"))).toMatchObject({
      error: "TOO_MANY_CANDIDATES",
    });
    expect(await run("ア".repeat(5001))).toMatchObject({ error: "TOO_MANY_CANDIDATES" });
    const r = await run(Array.from({ length: 30 }, () => "🌸").join("\n"));
    expect(r.ok === false && r.error === "INVALID_CANDIDATE" && r.details.length).toBe(20);
  });

  it("ジョブを送れなかった候補は unknown（FAILED）にして利用回数を戻す", async () => {
    const s = recordingSender([1]);
    const r = await run("ア\nイ\nウ", [], { sender: s });
    if (!r.ok) throw new Error();
    const cands = await testDb()
      .select()
      .from(checkCandidates)
      .where(eq(checkCandidates.checkId, r.checkId))
      .orderBy(checkCandidates.position);
    expect(cands.map((c) => c.status)).toEqual(["queued", "unknown", "queued"]);
    const [res] = await testDb().select().from(trademarkResults).where(eq(trademarkResults.candidateId, cands[1]!.id));
    expect(res).toMatchObject({ outcome: "unknown", errorCode: "FAILED" });
    expect(await used()).toBe(2);
  });
});
