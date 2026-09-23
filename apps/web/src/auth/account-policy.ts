import { MINUTE } from "@app/shared/time";

export interface AccountLike {
  providerId: string;
}

/** メールアドレスとパスワードのログイン手段を持つか。 */
export function hasPassword(accounts: AccountLike[]): boolean {
  return accounts.some((a) => a.providerId === "credential");
}

/** Google だけのアカウントは、メールアドレスを変えられない（FR-012a）。 */
export function canChangeEmail(accounts: AccountLike[]): boolean {
  return hasPassword(accounts);
}

/** 再認証の新しさ（Clarifications Round 1、research R6）。 */
export const REAUTH_WINDOW_MS = 10 * MINUTE;

export function isReauthFresh(reauthenticatedAt: Date | string | null | undefined, now: Date): boolean {
  if (!reauthenticatedAt) return false;
  const t = new Date(reauthenticatedAt).getTime();
  return now.getTime() - t < REAUTH_WINDOW_MS;
}
