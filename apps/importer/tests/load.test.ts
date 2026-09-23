import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, eq, sql, trademarkDatasets, trademarkMarks, trademarkReadings } from "@app/db";
import { importRows } from "../src/load";
import type { ImportRow } from "../src/tsv";

const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:55433/app_test";
const { db, pool } = createDb(url, { max: 2 });

const row = (n: string, over: Partial<ImportRow> = {}): ImportRow => ({
  applicationNumber: n,
  registrationNumber: null,
  markText: `商標${n}`,
  readings: ["サクラ"],
  holderName: "株式会社テスト",
  classes: [9],
  status: "registered",
  ...over,
});

describe("importRows（research R1、contracts/jobs-and-cli.md §3）", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table trademark_readings, trademark_marks, trademark_datasets cascade`);
  });
  afterAll(() => pool.end());

  it("full で取り込み、正規化した文字と称呼キーを保存し、データセットを active にする", async () => {
    const r = await importRows(db, [row("1", { markText: "ＢＬＵＥ", readings: ["ブルー", "ブル"] })], {
      asOf: "2026-09-20",
      mode: "full",
      source: "fixture",
    });
    expect(r).toMatchObject({ status: "active", rowCount: 1 });
    const [mark] = await db.select().from(trademarkMarks);
    expect(mark).toMatchObject({ normalizedText: "blue", classes: [9] });
    const readings = await db.select().from(trademarkReadings).orderBy(trademarkReadings.reading);
    expect(readings.map((x) => [x.reading, x.readingKey])).toEqual([
      ["ブル", "buru"],
      ["ブルー", "buruu"],
    ]);
    const [ds] = await db.select().from(trademarkDatasets);
    expect(ds).toMatchObject({ asOfDate: "2026-09-20", status: "active", mode: "full", source: "fixture" });
  });

  it("消滅（dead）の商標は取り込まない（FR-010a）", async () => {
    await importRows(db, [row("1"), row("2", { status: "dead" })], { asOf: "2026-09-20", mode: "full", source: "fixture" });
    const marks = await db.select().from(trademarkMarks);
    expect(marks.map((m) => m.applicationNumber)).toEqual(["1"]);
  });

  it("full は取り込み用 TSV にない商標を削除する", async () => {
    await importRows(db, [row("1"), row("2")], { asOf: "2026-09-01", mode: "full", source: "fixture" });
    await importRows(db, [row("2")], { asOf: "2026-09-20", mode: "full", source: "fixture" });
    const marks = await db.select().from(trademarkMarks);
    expect(marks.map((m) => m.applicationNumber)).toEqual(["2"]);
  });

  it("delta は追加・更新し、dead の行の商標を削除する。称呼は置き換える", async () => {
    await importRows(db, [row("1"), row("2")], { asOf: "2026-09-01", mode: "full", source: "fixture" });
    await importRows(
      db,
      [row("1", { status: "dead" }), row("2", { readings: ["ソラ"], status: "pending" }), row("3")],
      { asOf: "2026-09-08", mode: "delta", source: "fixture" },
    );
    const marks = await db.select().from(trademarkMarks).orderBy(trademarkMarks.applicationNumber);
    expect(marks.map((m) => [m.applicationNumber, m.status])).toEqual([
      ["2", "pending"],
      ["3", "registered"],
    ]);
    const r2 = await db.select().from(trademarkReadings).where(eq(trademarkReadings.applicationNumber, "2"));
    expect(r2.map((x) => x.reading)).toEqual(["ソラ"]);
  });

  it("失敗したら何も変えず、データセットを failed にして前の active を残す", async () => {
    await importRows(db, [row("1")], { asOf: "2026-09-01", mode: "full", source: "fixture" });
    const bad = row("9", { holderName: null as unknown as string });
    await expect(importRows(db, [row("2"), bad], { asOf: "2026-09-20", mode: "full", source: "fixture" })).rejects.toThrow();
    const marks = await db.select().from(trademarkMarks);
    expect(marks.map((m) => m.applicationNumber)).toEqual(["1"]);
    const sets = await db.select().from(trademarkDatasets).orderBy(trademarkDatasets.asOfDate);
    expect(sets.map((s) => [s.asOfDate, s.status])).toEqual([
      ["2026-09-01", "active"],
      ["2026-09-20", "failed"],
    ]);
  });
});
