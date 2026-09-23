import { describe, expect, it } from "vitest";
import {
  classesLabel,
  formatDate,
  formatDateTime,
  isDatasetStale,
  latestDataset,
  prefillLines,
  STALE_DAYS,
} from "@/checks/presentation";

describe("結果の表示（FR-015、FR-015a、routes.md）", () => {
  it("日時は日本時間で示す", () => {
    expect(formatDateTime(new Date("2026-09-23T03:05:00Z"))).toBe("2026/09/23 12:05");
    expect(formatDate("2026-09-20")).toBe("2026/09/20");
  });

  it("基準日が調べた日時より 30 日を超えて古ければ、古いと判定する", () => {
    expect(STALE_DAYS).toBe(30);
    expect(isDatasetStale("2026-08-24", new Date("2026-09-23T03:00:00Z"))).toBe(false);
    expect(isDatasetStale("2026-08-23", new Date("2026-09-23T03:00:00Z"))).toBe(true);
    expect(isDatasetStale(null, new Date())).toBe(false);
  });

  it("結果のうち、最も新しい基準日と調べた日時を返す", () => {
    expect(
      latestDataset([
        { datasetAsOf: "2026-09-01", checkedAt: new Date("2026-09-23T00:00:00Z") },
        null,
        { datasetAsOf: "2026-09-20", checkedAt: new Date("2026-09-23T01:00:00Z") },
        { datasetAsOf: null, checkedAt: new Date("2026-09-23T02:00:00Z") },
      ]),
    ).toEqual({ asOf: "2026-09-20", checkedAt: new Date("2026-09-23T01:00:00Z") });
    expect(latestDataset([null])).toBeNull();
  });

  it("区分は「全区分」か「第 n 類」で示す（US2）", () => {
    expect(classesLabel([])).toBe("全区分");
    expect(classesLabel([9, 25])).toBe("第 9 類、第 25 類");
  });

  it("読みを添えてチェックし直すとき、推定した読みを添えた行にする（FR-014a）", () => {
    expect(
      prefillLines([
        { inputText: "星空", reading: "ホシゾラ", userReading: null },
        { inputText: "ソラ", reading: "ソラ", userReading: "ソラ" },
        { inputText: "&&", reading: null, userReading: null },
      ]),
    ).toBe("星空 / ホシゾラ\nソラ / ソラ\n&&");
  });
});
