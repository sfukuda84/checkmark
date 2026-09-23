import { describe, expect, it } from "vitest";
import { decideAccess } from "@/auth/access";

const baseUser = { emailVerified: true, status: "active" as const, role: "user" as const };

describe("decideAccess", () => {
  it("未ログインならログイン画面へ", () => {
    expect(decideAccess({ user: null, consentComplete: false })).toEqual({ kind: "redirect", to: "/sign-in" });
  });
  it("未確認なら確認の案内へ", () => {
    expect(decideAccess({ user: { ...baseUser, emailVerified: false }, consentComplete: true })).toEqual({
      kind: "redirect",
      to: "/verify-email",
    });
  });
  it("停止中なら停止の画面へ（セッションを失効させる）", () => {
    expect(decideAccess({ user: { ...baseUser, status: "suspended" }, consentComplete: true })).toEqual({
      kind: "suspended",
    });
  });
  it("規約に未同意なら同意の画面へ", () => {
    expect(decideAccess({ user: baseUser, consentComplete: false })).toEqual({ kind: "redirect", to: "/consent" });
  });
  it("同意の画面そのものは、未同意でも通す", () => {
    expect(decideAccess({ user: baseUser, consentComplete: false, allowWithoutConsent: true })).toEqual({ kind: "ok" });
  });
  it("運営者の画面は、運営者でなければ 404", () => {
    expect(decideAccess({ user: baseUser, consentComplete: true, requireOperator: true })).toEqual({
      kind: "not-found",
    });
    expect(
      decideAccess({ user: { ...baseUser, role: "operator" }, consentComplete: true, requireOperator: true }),
    ).toEqual({ kind: "ok" });
  });
  it("停止の判定は、同意の判定より先に行う", () => {
    expect(decideAccess({ user: { ...baseUser, status: "suspended" }, consentComplete: false })).toEqual({
      kind: "suspended",
    });
  });
});
