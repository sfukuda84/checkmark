import { describe, expect, it } from "vitest";
import { fixedClock, MINUTE, HOUR } from "@app/shared/time";
import { AccountRateLimiter, bucketKey, createMemoryBucketStore, ACCOUNT_LIMITS } from "@/auth/rate-limit";

describe("bucketKey", () => {
  it("メールアドレスそのものではなく、小文字化した SHA-256 をキーにする", () => {
    const k = bucketKey("sign-in", " Foo@Example.COM ");
    expect(k).toMatch(/^sign-in:[0-9a-f]{64}$/);
    expect(k).toBe(bucketKey("sign-in", "foo@example.com"));
    expect(k).not.toContain("example");
  });
});

describe("AccountRateLimiter", () => {
  it("ログインは 15 分に 10 回まで。11 回目を拒む（FR-008）", async () => {
    const clock = fixedClock(new Date("2026-09-23T00:00:00Z"));
    const limiter = new AccountRateLimiter(createMemoryBucketStore(), clock);
    for (let i = 0; i < 10; i++) expect(await limiter.hit("sign-in", "a@example.com")).toBe(true);
    expect(await limiter.hit("sign-in", "a@example.com")).toBe(false);
  });

  it("窓が終わったら数え直す", async () => {
    const clock = fixedClock(new Date("2026-09-23T00:00:00Z"));
    const limiter = new AccountRateLimiter(createMemoryBucketStore(), clock);
    for (let i = 0; i < 11; i++) await limiter.hit("sign-in", "a@example.com");
    clock.advance(15 * MINUTE);
    expect(await limiter.hit("sign-in", "a@example.com")).toBe(true);
  });

  it("確認メールの送り直しは 1 時間に 3 回まで（FR-004）", async () => {
    const clock = fixedClock(new Date("2026-09-23T00:00:00Z"));
    const limiter = new AccountRateLimiter(createMemoryBucketStore(), clock);
    for (let i = 0; i < 3; i++) expect(await limiter.hit("resend-verification", "a@example.com")).toBe(true);
    expect(await limiter.hit("resend-verification", "a@example.com")).toBe(false);
    clock.advance(59 * MINUTE);
    expect(await limiter.hit("resend-verification", "a@example.com")).toBe(false);
    clock.advance(1 * MINUTE);
    expect(await limiter.hit("resend-verification", "a@example.com")).toBe(true);
  });

  it("アカウントと操作ごとに別々に数える", async () => {
    const clock = fixedClock(new Date("2026-09-23T00:00:00Z"));
    const limiter = new AccountRateLimiter(createMemoryBucketStore(), clock);
    for (let i = 0; i < 11; i++) await limiter.hit("sign-in", "a@example.com");
    expect(await limiter.hit("sign-in", "b@example.com")).toBe(true);
    expect(await limiter.hit("password-reset", "a@example.com")).toBe(true);
  });

  it("上限の設定が仕様どおりである", () => {
    expect(ACCOUNT_LIMITS["sign-in"]).toEqual({ max: 10, windowMs: 15 * MINUTE });
    expect(ACCOUNT_LIMITS["password-reset"]).toEqual({ max: 10, windowMs: 15 * MINUTE });
    expect(ACCOUNT_LIMITS["resend-verification"]).toEqual({ max: 3, windowMs: HOUR });
  });
});
