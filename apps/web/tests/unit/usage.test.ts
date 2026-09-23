import { describe, expect, it } from "vitest";
import { DEFAULT_MONTHLY_LIMIT, MAX_RUNNING_CHECKS, parseLimit, summarizeUsage } from "@/checks/usage";

describe("利用回数の計算（FR-025、FR-028、FR-029）", () => {
  it("既定の上限は 50、同時に実行できるチェックは 3", () => {
    expect(DEFAULT_MONTHLY_LIMIT).toBe(50);
    expect(MAX_RUNNING_CHECKS).toBe(3);
  });

  it("設定値が 0 以上の整数ならそれを使い、そうでなければ既定値を使う", () => {
    expect(parseLimit(10)).toBe(10);
    expect(parseLimit(0)).toBe(0);
    expect(parseLimit(-1)).toBe(50);
    expect(parseLimit("20")).toBe(50);
    expect(parseLimit(undefined)).toBe(50);
  });

  it("残りと次に戻る日時を返す。使いすぎても残りは 0 未満にしない", () => {
    const at = new Date("2026-09-23T03:00:00Z");
    expect(summarizeUsage({ limit: 50, used: 12, at })).toEqual({
      limit: 50,
      used: 12,
      remaining: 38,
      period: "2026-09",
      resetsAt: new Date("2026-09-30T15:00:00Z"),
    });
    expect(summarizeUsage({ limit: 10, used: 12, at }).remaining).toBe(0);
  });
});
