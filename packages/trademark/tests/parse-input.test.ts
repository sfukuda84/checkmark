import { describe, expect, it } from "vitest";
import { parseCandidateInput } from "../src/parse-input";

describe("parseCandidateInput（research R2、FR-001、FR-003、FR-004a）", () => {
  it("1 行に 1 件ずつ解析し、空行を無視する", () => {
    const r = parseCandidateInput("サクラ\n\n  \nソラマメ\n");
    expect(r.errors).toEqual([]);
    expect(r.candidates.map((c) => c.inputText)).toEqual(["サクラ", "ソラマメ"]);
    expect(r.merged).toBe(0);
  });

  it("「候補名 / ヨミ」の形で読みを添えられる（全角の／も区切りにする）", () => {
    const r = parseCandidateInput("桜の道 / さくらのみち\nApple／アップル\n空豆");
    expect(r.candidates).toEqual([
      { inputText: "桜の道", normalizedText: "桜ノ道", userReading: "サクラノミチ" },
      { inputText: "Apple", normalizedText: "apple", userReading: "アップル" },
      { inputText: "空豆", normalizedText: "空豆", userReading: null },
    ]);
  });

  it("正規化して同じになる候補を 1 件にまとめ、まとめた件数を返す", () => {
    const r = parseCandidateInput("さくら\nサクラ\nｻｸﾗ\nSORA\nsora");
    expect(r.candidates.map((c) => c.inputText)).toEqual(["さくら", "SORA"]);
    expect(r.merged).toBe(3);
  });

  it("不正な行を、行番号と理由つきで返す", () => {
    const r = parseCandidateInput("サクラ\n🌸\n" + "ア".repeat(51) + "\nソラ / sora\n / ヨミ");
    expect(r.errors).toEqual([
      { line: 2, reason: "INVALID_CHARS" },
      { line: 3, reason: "TOO_LONG" },
      { line: 4, reason: "INVALID_READING" },
      { line: 5, reason: "EMPTY" },
    ]);
  });

  it("空の読み（区切りだけ）は読みなしとして扱う", () => {
    const r = parseCandidateInput("サクラ /");
    expect(r.candidates).toEqual([{ inputText: "サクラ", normalizedText: "サクラ", userReading: null }]);
  });
});
