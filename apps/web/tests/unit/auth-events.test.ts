import { describe, expect, it, vi } from "vitest";
import { buildAuthEvent } from "@/events/auth-events";

describe("buildAuthEvent", () => {
  it("種類、利用者、接続元だけを持ち、メールアドレスを持たない（FR-031）", () => {
    const e = buildAuthEvent("sign_in_failed", { userId: null, ipAddress: "203.0.113.5", userAgent: "UA" });
    expect(e).toEqual({ type: "sign_in_failed", userId: null, ipAddress: "203.0.113.5", userAgent: "UA" });
    expect(Object.keys(e)).not.toContain("email");
  });

  it("知らない種類は受け付けない", () => {
    // @ts-expect-error 型でも拒否する
    expect(() => buildAuthEvent("unknown", { userId: null })).toThrow();
  });

  it("User-Agent は長すぎれば切り詰める", () => {
    const e = buildAuthEvent("sign_in_succeeded", { userId: "u1", userAgent: "x".repeat(1000) });
    expect(e.userAgent!.length).toBeLessThanOrEqual(512);
    vi.restoreAllMocks();
  });
});
