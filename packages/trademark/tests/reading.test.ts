import { afterAll, describe, expect, it } from "vitest";
import { createKuromojiTokenizer, estimateReading, type ReadingDeps } from "../src/reading";

const kuromoji = createKuromojiTokenizer({ idleMs: 60_000 });
afterAll(() => kuromoji.release());

const deps = (readings: Record<string, string[]> = {}): ReadingDeps => ({
  readingsForText: async (t) => readings[t] ?? [],
  tokenize: kuromoji.tokenize,
});

describe("estimateReading（research R3、FR-014）", () => {
  it("利用者が添えた読みを、推定ではない読みとして使う", async () => {
    expect(await estimateReading({ normalizedText: "桜ノ道", userReading: "オウノミチ" }, deps())).toEqual({
      reading: "オウノミチ",
      estimated: false,
    });
  });

  it("仮名だけの候補は、その文字を推定ではない読みとして使う（空白と記号は除く）", async () => {
    expect(await estimateReading({ normalizedText: "ソラ・マメー", userReading: null }, deps())).toEqual({
      reading: "ソラマメー",
      estimated: false,
    });
  });

  it("同じ文字の既存の商標があれば、その称呼を推定の読みとして使う", async () => {
    expect(
      await estimateReading({ normalizedText: "bluemoon", userReading: null }, deps({ bluemoon: ["ブルームーン"] })),
    ).toEqual({
      reading: "ブルームーン",
      estimated: true,
    });
  });

  it("漢字を含む候補は、形態素解析の読みを使う", async () => {
    expect(await estimateReading({ normalizedText: "桜ノ道", userReading: null }, deps())).toEqual({
      reading: "サクラノミチ",
      estimated: true,
    });
    expect((await estimateReading({ normalizedText: "山田商店", userReading: null }, deps())).reading).toBe(
      "ヤマダショウテン",
    );
  });

  it("ローマ字として読める英字はカナにし、読めない英字はアルファベットの読みにする", async () => {
    expect((await estimateReading({ normalizedText: "sakura", userReading: null }, deps())).reading).toBe("サクラ");
    expect((await estimateReading({ normalizedText: "xyz", userReading: null }, deps())).reading).toBe(
      "エックスワイゼット",
    );
  });

  it("数字は 1 桁ずつの読みにし、記号は読みから除く", async () => {
    expect((await estimateReading({ normalizedText: "abc-123", userReading: null }, deps())).reading).toBe(
      "エービーシーイチニサン",
    );
    expect((await estimateReading({ normalizedText: "東京タワー2", userReading: null }, deps())).reading).toBe(
      "トウキョウタワーニ",
    );
  });

  it("読みが得られなければ null", async () => {
    expect(await estimateReading({ normalizedText: "!!!", userReading: null }, deps())).toEqual({
      reading: null,
      estimated: true,
    });
  });

  it("漢字を含まない候補では辞書を読み込まない", async () => {
    let called = 0;
    await estimateReading(
      { normalizedText: "sakura", userReading: null },
      { readingsForText: async () => [], tokenize: async () => ((called += 1), []) },
    );
    expect(called).toBe(0);
  });
});

describe("createKuromojiTokenizer", () => {
  it("使わない時間が続いたら辞書を手放し、次に使うときに読み込み直す", async () => {
    const t = createKuromojiTokenizer({ idleMs: 50 });
    await t.tokenize("山田");
    expect(t.isLoaded()).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(t.isLoaded()).toBe(false);
    expect((await t.tokenize("山田"))[0]?.reading).toBe("ヤマダ");
    t.release();
  });
});
