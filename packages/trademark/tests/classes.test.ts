import { describe, expect, it } from "vitest";
import { isTrademarkClass, TRADEMARK_CLASSES } from "../src/classes";

describe("TRADEMARK_CLASSES（FR-006）", () => {
  it("第 1 類〜第 45 類に説明がある。第 34 類までが商品、第 35 類からが役務", () => {
    expect(TRADEMARK_CLASSES).toHaveLength(45);
    expect(TRADEMARK_CLASSES.every((c) => c.description.length > 0)).toBe(true);
    expect(TRADEMARK_CLASSES[33]).toMatchObject({ number: 34, kind: "goods" });
    expect(TRADEMARK_CLASSES[34]).toMatchObject({ number: 35, kind: "services" });
  });

  it("isTrademarkClass は 1〜45 の整数だけを受け付ける", () => {
    expect([1, 45].every(isTrademarkClass)).toBe(true);
    expect([0, 46, 1.5, Number.NaN].some(isTrademarkClass)).toBe(false);
  });
});
