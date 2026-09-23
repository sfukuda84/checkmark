import { isAPIError } from "better-auth/api";
import { eq, session as sessionTable, type Database } from "@app/db";
import { systemClock, type Clock } from "@app/shared/time";
import type { Auth } from "./auth";

export type ReauthResult =
  { ok: true } | { ok: false; code: "INVALID_PASSWORD" | "NO_PASSWORD" | "TOO_MANY_ATTEMPTS" | "UNAUTHORIZED" };

/**
 * パスワードの再入力による再認証（research R6）。
 * Better Auth の verifyPassword（サーバー専用）で照合し、今のセッションの reauthenticatedAt を更新する。
 */
export async function reauthenticateWithPassword(
  auth: Auth,
  db: Database,
  headers: Headers,
  password: string,
  clock: Clock = systemClock,
): Promise<ReauthResult> {
  const current = await auth.api.getSession({ headers });
  if (!current) return { ok: false, code: "UNAUTHORIZED" };
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch (err) {
    if (isAPIError(err)) {
      const code = (err.body as { code?: string } | undefined)?.code;
      if (err.statusCode === 429) return { ok: false, code: "TOO_MANY_ATTEMPTS" };
      if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return { ok: false, code: "NO_PASSWORD" };
      return { ok: false, code: "INVALID_PASSWORD" };
    }
    throw err;
  }
  await db.update(sessionTable).set({ reauthenticatedAt: clock.now() }).where(eq(sessionTable.id, current.session.id));
  return { ok: true };
}
