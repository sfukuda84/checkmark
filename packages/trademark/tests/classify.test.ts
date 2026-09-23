import { describe, expect, it } from "vitest";
import { buildTrademarkResult, MAX_SIMILAR_MATCHES } from "../src/classify";
import type { MarkRecord } from "../src/source";

const mark = (n: string, text = `商標${n}`): MarkRecord => ({
  applicationNumber: n,
  registrationNumber: null,
  markText: text,
  holderName: "株式会社テスト",
  classes: [9],
  status: "registered",
});

describe("buildTrademarkResult（FR-009、FR-013）", () => {
  it("同じ文字の商標があれば identical にし、同一を先に並べる", () => {
    const r = buildTrademarkResult({
      reading: "サクラ",
      identical: [mark("1", "サクラ")],
      similarCandidates: [
        { mark: mark("1", "サクラ"), reading: "サクラ" },
        { mark: mark("2", "サクマ"), reading: "サクマ" },
      ],
    });
    expect(r.outcome).toBe("identical");
    expect(r.matches.map((m) => [m.kind, m.applicationNumber])).toEqual([
      ["identical", "1"],
      ["similar", "2"],
    ]);
    expect(r.matches[0]!.score).toBe(1);
  });

  it("同一がなく類似があれば similar にし、似ている順に並べる", () => {
    const r = buildTrademarkResult({
      reading: "サクラノミチ",
      identical: [],
      similarCandidates: [
        { mark: mark("a"), reading: "サクマノミチ" },
        { mark: mark("b"), reading: "サクラノミチ" },
        { mark: mark("c"), reading: "モミジ" },
      ],
    });
    expect(r.outcome).toBe("similar");
    expect(r.matches.map((m) => m.applicationNumber)).toEqual(["b", "a"]);
    expect(r.matches[0]!.reading).toBe("サクラノミチ");
  });

  it("1 つの商標に称呼が複数あれば、最も似ている称呼で数える", () => {
    const r = buildTrademarkResult({
      reading: "アップル",
      identical: [],
      similarCandidates: [
        { mark: mark("x"), reading: "リンゴ" },
        { mark: mark("x"), reading: "アプル" },
      ],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.reading).toBe("アプル");
  });

  it("どちらもなければ none", () => {
    const r = buildTrademarkResult({ reading: "ソラマメ", identical: [], similarCandidates: [] });
    expect(r).toEqual({ outcome: "none", matches: [], readingUnavailable: false });
  });

  it("類似は上位 20 件までにする", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ mark: mark(`m${String(i).padStart(2, "0")}`), reading: "サクラ" }));
    const r = buildTrademarkResult({ reading: "サクラ", identical: [], similarCandidates: many });
    expect(r.matches).toHaveLength(MAX_SIMILAR_MATCHES);
  });

  it("読みがなければ同一だけを判定し、readingUnavailable を立てる（research R3）", () => {
    const r = buildTrademarkResult({ reading: null, identical: [], similarCandidates: [] });
    expect(r).toEqual({ outcome: "none", matches: [], readingUnavailable: true });
  });
});
