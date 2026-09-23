import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFixture } from "@app/importer/testing";
import { readingKey } from "@app/trademark";
import { createPgTrademarkSource } from "../src/jobs/pg-trademark-source";
import { db, handle, resetAll } from "./helpers";

const source = createPgTrademarkSource(db);

describe("PgTrademarkSource（research R4、憲章 III）", () => {
  beforeAll(async () => {
    await resetAll();
    await seedFixture(db, "2026-09-20");
  });
  afterAll(() => handle.pool.end());

  it("activeDataset は最新の active の基準日を返す", async () => {
    expect(await source.activeDataset()).toMatchObject({ asOfDate: "2026-09-20" });
  });

  it("findIdentical は正規化した文字が同じ商標を返す。消滅した商標は含まない", async () => {
    expect((await source.findIdentical("サクラノミチ", [])).map((m) => m.applicationNumber)).toEqual(["2020-000001"]);
    expect((await source.findIdentical("コトノハ", [])).map((m) => m.applicationNumber).sort()).toEqual([
      "2020-000016",
      "2020-000017",
    ]);
    expect(await source.findIdentical("キエタショウヒョウ", [])).toEqual([]);
  });

  it("区分を選んだら、そのいずれかを含む商標だけを返す（FR-010）", async () => {
    expect((await source.findIdentical("ミライデンキ", [])).length).toBe(2);
    expect((await source.findIdentical("ミライデンキ", [9])).map((m) => m.applicationNumber)).toEqual(["2020-000004"]);
    expect((await source.findIdentical("ミライデンキ", [1, 2])).length).toBe(0);
  });

  it("findSimilarCandidates は称呼キーの近い候補を返す", async () => {
    const got = await source.findSimilarCandidates(readingKey("サクラノミチ"), [], "");
    const ids = got.map((c) => c.mark.applicationNumber);
    expect(ids).toContain("2020-000001");
    expect(ids).toContain("2020-000002");
    expect(ids).not.toContain("2020-000009");
    const hit = got.find((c) => c.mark.applicationNumber === "2020-000002");
    expect(hit).toMatchObject({ reading: "サクマノミチ", mark: { holderName: "検証用製菓株式会社", classes: [30] } });
  });

  it("正規化後の文字が同じ商標（同一）は類似の候補に含めない", async () => {
    const got = await source.findSimilarCandidates(readingKey("サクラノミチ"), [], "サクラノミチ");
    const ids = got.map((c) => c.mark.applicationNumber);
    expect(ids).not.toContain("2020-000001");
    expect(ids).toContain("2020-000002");
    expect(
      (await source.findSimilarCandidates(readingKey("モミ"), [], "モミジ")).map((c) => c.mark.applicationNumber),
    ).not.toContain("2020-000009");
  });

  it("短い称呼キーでも候補を返す", async () => {
    const got = await source.findSimilarCandidates(readingKey("モミ"), [], "");
    expect(got.map((c) => c.mark.applicationNumber)).toContain("2020-000009");
  });

  it("findSimilarCandidates も区分で絞る", async () => {
    const got = await source.findSimilarCandidates(readingKey("ハルカゼ"), [25], "");
    expect(got.map((c) => c.mark.applicationNumber)).toEqual(["2020-000015"]);
  });

  it("readingsForText は同じ文字の商標の称呼を返す", async () => {
    expect(await source.readingsForText("星空")).toEqual(["ホシゾラ"]);
    expect(await source.readingsForText("bluemoon")).toEqual(["ブルームン", "ブルームーン"].sort());
    expect(await source.readingsForText("ない")).toEqual([]);
  });
});
