import { consents, eq, session as sessionTable, user as userTable, type Database } from "@app/db";
import { missingConsents } from "@/legal/consent";
import { decideAccess, type AccessDecision } from "./access";
import type { Auth } from "./auth";

export interface ResolveOptions {
  allowWithoutConsent?: boolean;
  requireOperator?: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: "user" | "operator";
  status: "active" | "suspended";
  emailVerified: boolean;
}

export interface ResolvedAccess {
  decision: AccessDecision;
  user: CurrentUser | null;
  sessionId: string | null;
}

/**
 * 画面とサーバー処理の入口の判定に要る状態を、毎回 DB から読む（research R9）。
 * 停止は、次の操作から反映する（US6-4）。停止中なら、その利用者のセッションをすべて失効させる。
 */
export async function resolveAccess(
  auth: Auth,
  db: Database,
  headers: Headers,
  options: ResolveOptions = {},
): Promise<ResolvedAccess> {
  const current = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!current) return { decision: decideAccess({ user: null, consentComplete: false }), user: null, sessionId: null };

  const [row] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      role: userTable.role,
      status: userTable.status,
      emailVerified: userTable.emailVerified,
    })
    .from(userTable)
    .where(eq(userTable.id, current.user.id))
    .limit(1);
  if (!row) return { decision: { kind: "redirect", to: "/sign-in" }, user: null, sessionId: null };

  const records = await db
    .select({ document: consents.document, version: consents.version })
    .from(consents)
    .where(eq(consents.userId, row.id));
  const decision = decideAccess({
    user: row,
    consentComplete: missingConsents(records).length === 0,
    allowWithoutConsent: options.allowWithoutConsent,
    requireOperator: options.requireOperator,
  });

  if (decision.kind === "suspended") {
    await db.delete(sessionTable).where(eq(sessionTable.userId, row.id));
  }
  return { decision, user: row, sessionId: current.session.id };
}
