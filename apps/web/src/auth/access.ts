import type { UserRole, UserStatus } from "@app/db";

export interface AccessUser {
  emailVerified: boolean;
  status: UserStatus;
  role: UserRole;
}

export interface AccessInput {
  user: AccessUser | null;
  consentComplete: boolean;
  /** 同意の画面など、未同意でも入れる画面。 */
  allowWithoutConsent?: boolean;
  requireOperator?: boolean;
}

export type AccessDecision =
  { kind: "ok" } | { kind: "redirect"; to: string } | { kind: "suspended" } | { kind: "not-found" };

/**
 * ログインが要る画面の入口の判定（contracts/routes.md）。
 * 順序: 未ログイン → 未確認 → 停止 → 同意 → 運営者。
 */
export function decideAccess(input: AccessInput): AccessDecision {
  const { user } = input;
  if (!user) return { kind: "redirect", to: "/sign-in" };
  if (!user.emailVerified) return { kind: "redirect", to: "/verify-email" };
  if (user.status === "suspended") return { kind: "suspended" };
  if (!input.consentComplete && !input.allowWithoutConsent) return { kind: "redirect", to: "/consent" };
  if (input.requireOperator && user.role !== "operator") return { kind: "not-found" };
  return { kind: "ok" };
}
