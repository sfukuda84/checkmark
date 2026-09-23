import { describe, expect, it } from "vitest";
import { decideMaintenance } from "@/proxy";

describe("decideMaintenance（FR-028）", () => {
  it("メンテナンス中でなければ、すべて通す", () => {
    expect(decideMaintenance("/", false)).toBe("pass");
    expect(decideMaintenance("/sign-in", false)).toBe("pass");
  });
  it("メンテナンス中は、画面と API を /maintenance に書き換える", () => {
    expect(decideMaintenance("/", true)).toBe("rewrite");
    expect(decideMaintenance("/api/auth/sign-in/email", true)).toBe("rewrite");
    expect(decideMaintenance("/account", true)).toBe("rewrite");
  });
  it("メンテナンスの画面と静的ファイルは通す", () => {
    expect(decideMaintenance("/maintenance", true)).toBe("pass");
    expect(decideMaintenance("/_next/static/chunk.js", true)).toBe("pass");
  });
});
