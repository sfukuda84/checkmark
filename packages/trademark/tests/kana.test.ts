import { describe, expect, it } from "vitest";
import { readingKey, toMoras } from "../src/kana";

describe("toMoras（research R4）", () => {
  it("拗音と小書きの仮名を前の仮名につなげる", () => {
    expect(toMoras("キャラメル")).toEqual(["キャ", "ラ", "メ", "ル"]);
    expect(toMoras("ファミリー")).toEqual(["ファ", "ミ", "リ", "ー"]);
  });

  it("促音、撥音、長音は 1 拍として数える", () => {
    expect(toMoras("アップル")).toEqual(["ア", "ッ", "プ", "ル"]);
    expect(toMoras("ラーメン")).toEqual(["ラ", "ー", "メ", "ン"]);
  });

  it("カタカナ以外は除く", () => {
    expect(toMoras("ア イ・ウ")).toEqual(["ア", "イ", "ウ"]);
  });
});

describe("readingKey（research R4）", () => {
  it("ASCII のローマ字にする", () => {
    expect(readingKey("サクラ")).toBe("sakura");
    expect(readingKey("キャラメル")).toBe("kyarameru");
    expect(readingKey("アップル")).toBe("appuru");
  });

  it("長音は直前の母音にする", () => {
    expect(readingKey("ラーメン")).toBe("raamen");
    expect(readingKey("ソニー")).toBe("sonii");
  });

  it("ASCII の小文字だけを返す", () => {
    expect(readingKey("ヴィ・ア")).toMatch(/^[a-z]+$/);
  });
});
