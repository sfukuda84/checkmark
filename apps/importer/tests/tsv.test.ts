import { describe, expect, it } from "vitest";
import { parseImportTsv } from "../src/tsv";

const HEADER = "application_number\tregistration_number\tmark_text\treadings\tholder_name\tclasses\tstatus";

describe("parseImportTsv（contracts/jobs-and-cli.md §3）", () => {
  it("行を読み、称呼を ; で、区分を , で分ける", () => {
    const r = parseImportTsv(
      `${HEADER}\n2020-1\t6001\tBLUEMOON\tブルームーン;ぶるーむん\t株式会社A\t9,25\tregistered\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        applicationNumber: "2020-1",
        registrationNumber: "6001",
        markText: "BLUEMOON",
        readings: ["ブルームーン", "ブルームン"],
        holderName: "株式会社A",
        classes: [9, 25],
        status: "registered",
      },
    ]);
  });

  it("登録番号と称呼は空でよい", () => {
    const r = parseImportTsv(`${HEADER}\n2020-2\t\tソラ\t\t株式会社B\t31\tpending`);
    expect(r.rows[0]).toMatchObject({ registrationNumber: null, readings: [], status: "pending" });
  });

  it("列の並びは見出しで決める", () => {
    const r = parseImportTsv(
      "status\tclasses\tholder_name\tmark_text\tapplication_number\nregistered\t1\tC\tX\t2020-3",
    );
    expect(r.rows[0]).toMatchObject({ applicationNumber: "2020-3", markText: "X", classes: [1] });
  });

  it("必須の列がなければ全体をエラーにする", () => {
    const r = parseImportTsv("application_number\tmark_text\n2020-4\tX");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatchObject({ line: 1, message: expect.stringContaining("holder_name") });
  });

  it("区分の範囲、状態、必須の値、称呼の文字を検証し、行番号つきのエラーを返す", () => {
    const r = parseImportTsv(
      [
        HEADER,
        "2020-5\t\tA\t\tH\t46\tregistered",
        "2020-6\t\tB\t\tH\t1\tunknown",
        "\t\tC\t\tH\t1\tregistered",
        "2020-8\t\tD\tabc\tH\t1\tregistered",
        "2020-9\t\tE\t\tH\t1\tdead",
      ].join("\n"),
    );
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(r.rows.map((x) => x.applicationNumber)).toEqual(["2020-9"]);
  });

  it("消滅（dead）の行は、区分がなくても受け付ける", () => {
    const r = parseImportTsv(`${HEADER}\n2020-10\t\tF\t\tH\t\tdead`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ status: "dead", classes: [] });
  });
});
