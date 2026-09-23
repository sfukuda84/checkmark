import { describe, expect, it } from "vitest";
import { SIMILAR_THRESHOLD, similarityScore } from "../src/similarity";

describe("similarityScore（research R4、SC-004）", () => {
  it("同じ読みは 1", () => {
    expect(similarityScore("サクラ", "サクラ")).toBe(1);
  });

  it("清音と濁音・半濁音の違いは小さい差として扱い、類似にする", () => {
    const s = similarityScore("カルタ", "ガルタ");
    expect(s).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD);
    expect(s).toBeGreaterThan(similarityScore("カルタ", "マルタ"));
  });

  it("同じ行の母音違いは小さい差として扱う", () => {
    expect(similarityScore("ソラマメ", "ソラマミ")).toBeGreaterThan(similarityScore("ソラマメ", "ソラマニ"));
  });

  it("長音と促音の有無は小さい差として扱い、類似にする", () => {
    expect(similarityScore("ソニー", "ソニ")).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD);
    expect(similarityScore("アップル", "アプル")).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD);
  });

  it("1 音違いの 4 音の読みは類似にする", () => {
    expect(similarityScore("サクラノ", "サクマノ")).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD);
  });

  it("無関係の読みは類似にしない", () => {
    expect(similarityScore("サクラ", "モミジ")).toBeLessThan(SIMILAR_THRESHOLD);
    expect(similarityScore("ソラマメ", "キャラメル")).toBeLessThan(SIMILAR_THRESHOLD);
  });

  it("空の読みは 0", () => {
    expect(similarityScore("", "サクラ")).toBe(0);
  });

  it("0 以上 1 以下で、対称である", () => {
    const a = similarityScore("アップル", "パイナップル");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(a).toBe(similarityScore("パイナップル", "アップル"));
  });
});
