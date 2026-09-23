import { describe, expect, it } from "vitest";
import { canChangeEmail, hasPassword, isReauthFresh, REAUTH_WINDOW_MS } from "@/auth/account-policy";

describe("hasPassword", () => {
  it("credential のログイン手段があるかで判定する", () => {
    expect(hasPassword([{ providerId: "credential" }])).toBe(true);
    expect(hasPassword([{ providerId: "google" }, { providerId: "credential" }])).toBe(true);
    expect(hasPassword([{ providerId: "google" }])).toBe(false);
    expect(hasPassword([])).toBe(false);
  });
});

describe("canChangeEmail", () => {
  it("Google だけのアカウントはメールアドレスを変えられない（FR-012a）", () => {
    expect(canChangeEmail([{ providerId: "google" }])).toBe(false);
    expect(canChangeEmail([{ providerId: "credential" }, { providerId: "google" }])).toBe(true);
  });
});

describe("isReauthFresh", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("再認証から 10 分以内なら新しい", () => {
    expect(REAUTH_WINDOW_MS).toBe(10 * 60_000);
    expect(isReauthFresh(new Date(now.getTime() - 9 * 60_000), now)).toBe(true);
    expect(isReauthFresh(new Date(now.getTime() - 10 * 60_000), now)).toBe(false);
  });
  it("再認証の記録がなければ新しくない", () => {
    expect(isReauthFresh(null, now)).toBe(false);
    expect(isReauthFresh(undefined, now)).toBe(false);
  });
});
