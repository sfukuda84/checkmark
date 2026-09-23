import { describe, expect, it } from "vitest";
import { MAX_CANDIDATE_LENGTH, normalizeText, toKatakana, validateCandidateText, validateReading } from "../src/normalize";

describe("normalizeText（research R2、FR-003）", () => {
  it("全角・半角、ひらがな・カタカナ、大文字・小文字の違いをそろえる", () => {
    expect(normalizeText("ＡＢＣ")).toBe("abc");
    expect(normalizeText("ｻｸﾗ")).toBe("サクラ");
    expect(normalizeText("さくら")).toBe("サクラ");
    expect(normalizeText("Sakura")).toBe("sakura");
  });

  it("前後の空白を除き、連続する空白を 1 つにする", () => {
    expect(normalizeText("  ソラ　　マメ  ")).toBe("ソラ マメ");
  });

  it("漢字はそのまま残す", () => {
    expect(normalizeText("桜の道")).toBe("桜ノ道");
  });
});

describe("toKatakana", () => {
  it("ひらがなだけをカタカナにする", () => {
    expect(toKatakana("ぁあゔーabc漢")).toBe("ァアヴーabc漢");
  });
});

describe("validateCandidateText（FR-004）", () => {
  it("使える文字だけの候補を受け付け、正規化前の入力を前後の空白を除いて返す", () => {
    expect(validateCandidateText("  Sakura & ソラ・マメ!  ")).toEqual({ ok: true, text: "Sakura & ソラ・マメ!" });
    expect(validateCandidateText("山田ー々")).toMatchObject({ ok: true });
    expect(validateCandidateText("A-1.co'")).toMatchObject({ ok: true });
  });

  it("空の候補を拒む", () => {
    expect(validateCandidateText("   ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("50 文字を超える候補を拒む", () => {
    expect(validateCandidateText("ア".repeat(MAX_CANDIDATE_LENGTH))).toMatchObject({ ok: true });
    expect(validateCandidateText("ア".repeat(MAX_CANDIDATE_LENGTH + 1))).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("絵文字、制御文字、許していない記号を拒む", () => {
    expect(validateCandidateText("サクラ🌸")).toEqual({ ok: false, reason: "INVALID_CHARS" });
    expect(validateCandidateText("サクラ\u0007")).toEqual({ ok: false, reason: "INVALID_CHARS" });
    expect(validateCandidateText("<script>")).toEqual({ ok: false, reason: "INVALID_CHARS" });
  });
});

describe("validateReading（FR-004a）", () => {
  it("ひらがなとカタカナの読みを受け付け、カタカナにそろえる", () => {
    expect(validateReading("さくら")).toEqual({ ok: true, reading: "サクラ" });
    expect(validateReading(" ｿﾗﾏﾒ ")).toEqual({ ok: true, reading: "ソラマメ" });
    expect(validateReading("ラーメン")).toEqual({ ok: true, reading: "ラーメン" });
  });

  it("カタカナ以外と、50 文字を超える読みを拒む", () => {
    expect(validateReading("sakura")).toEqual({ ok: false, reason: "INVALID_READING" });
    expect(validateReading("桜")).toEqual({ ok: false, reason: "INVALID_READING" });
    expect(validateReading("ア".repeat(51))).toEqual({ ok: false, reason: "READING_TOO_LONG" });
  });
});
