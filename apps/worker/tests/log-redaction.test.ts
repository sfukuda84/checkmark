import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedFixture } from "@app/importer/testing";
import type { TrademarkSource } from "@app/trademark";
import { expireTrademarkChecks } from "../src/jobs/expire-trademark-checks";
import { createPgTrademarkSource } from "../src/jobs/pg-trademark-source";
import { handleTrademarkCheck } from "../src/jobs/trademark-check";
import { captureLogger, createCheck, db, handle, resetAll, resetChecks } from "./helpers";

const SECRET = "ヒミツノショウヒン";

describe("ログに候補名を出さない（SC-006、FR-031）", () => {
  beforeAll(async () => {
    await resetAll();
    await seedFixture(db, "2026-09-20");
  });
  beforeEach(resetChecks);
  afterAll(() => handle.pool.end());

  it("照合の成功、途中の失敗、最後の失敗、期限切れのどれでも、候補名と読みがログに出ない", async () => {
    const { logger, lines } = captureLogger();
    const source = createPgTrademarkSource(db);
    // 候補名を含むエラーを投げる取得元（DB のエラーに値が入る場合を模す）
    const broken: TrademarkSource = {
      ...source,
      findIdentical: async (text) => {
        throw new Error(`invalid input: ${text}`);
      },
    };
    const { candidates } = await createCheck([
      { text: SECRET, reading: SECRET },
      { text: `${SECRET}2` },
      { text: `${SECRET}3` },
    ]);
    await handleTrademarkCheck(
      { db, source, tokenize: async () => [], logger },
      { data: { candidateId: candidates[0]!.id, attempt: 1 }, retryCount: 0, retryLimit: 1 },
    );
    await handleTrademarkCheck(
      { db, source: broken, tokenize: async () => [], logger },
      { data: { candidateId: candidates[1]!.id, attempt: 1 }, retryCount: 0, retryLimit: 1 },
    ).catch(() => {});
    await handleTrademarkCheck(
      { db, source: broken, tokenize: async () => [], logger },
      { data: { candidateId: candidates[1]!.id, attempt: 1 }, retryCount: 1, retryLimit: 1 },
    );
    const expired = await expireTrademarkChecks(db, new Date(Date.now() + 10 * 60_000));
    logger.info({ expired }, "期限切れ");

    const out = lines.join("");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("ヒミツ");
    // 個別の照合結果（分類）も出さない（FR-031）
    expect(out).not.toMatch(/"outcome"/);
  });

  it("再試行に回す例外に、元の例外（候補名を含む問い合わせの値）を持たせない（pg-boss がジョブに保存するため）", async () => {
    const source = createPgTrademarkSource(db);
    const leaky = Object.assign(new Error(`Failed query: select ...\nparams: ${SECRET}`), { params: [SECRET] });
    const broken: TrademarkSource = {
      ...source,
      findIdentical: async () => {
        throw leaky;
      },
    };
    const { candidates } = await createCheck([{ text: SECRET }]);
    const thrown = await handleTrademarkCheck(
      { db, source: broken, tokenize: async () => [], logger: captureLogger().logger },
      { data: { candidateId: candidates[0]!.id, attempt: 1 }, retryCount: 0, retryLimit: 1 },
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(thrown).toBeInstanceOf(Error);
    const e = thrown as Error & Record<string, unknown>;
    const serialized = JSON.stringify({ ...e, message: e.message, stack: e.stack, cause: e.cause });
    expect(serialized).not.toContain(SECRET);
    expect(e.cause).toBeUndefined();
    expect(e.name).toBe("TrademarkCheckError");
  });
});
