import { eq, account, consents, user as userTable, verification, type Database } from "@app/db";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import type { Logger } from "@app/shared/logger";
import type { Clock } from "@app/shared/time";
import { recordAuthEvent } from "@/events/auth-events";
import type { EmailEnqueuer } from "@/jobs/client";
import { isValidPendingConsent, PENDING_CONSENT_COOKIE, readCookie } from "@/legal/consent";
import { CURRENT_VERSIONS } from "@/legal/registry";
import { canChangeEmail, hasPassword, isReauthFresh } from "./account-policy";
import {
  accountSuspended,
  consentRequired,
  emailChangeNotAllowed,
  passwordCompromised,
  reauthRequired,
  tooManyAttempts,
} from "./errors";
import type { PwnedPasswordChecker } from "./pwned";
import type { AccountRateLimiter, LimitedAction } from "./rate-limit";
import { readVerificationToken, tokenFromUrl } from "./tokens";

export interface HookDeps {
  db: Database;
  mailer: EmailEnqueuer;
  pwned: PwnedPasswordChecker;
  limiter: AccountRateLimiter;
  clock: Clock;
  logger: Logger;
  supportContact: string;
}

/** 試行の制限をかける操作（research R4）。 */
const LIMITED_PATHS: Record<string, LimitedAction> = {
  "/sign-in/email": "sign-in",
  "/request-password-reset": "password-reset",
  "/send-verification-email": "resend-verification",
};

/** 漏えいパスワードの確認をかける操作と、パスワードの項目名（research R5）。 */
const PASSWORD_FIELDS: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
};

interface RequestLike {
  headers?: Headers;
  request?: Request;
}

function clientInfo(ctx: RequestLike | null | undefined): { ipAddress: string | null; userAgent: string | null } {
  const headers = ctx?.headers ?? ctx?.request?.headers;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || headers?.get("x-real-ip") || null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}

function requestInfo(request?: Request): { ipAddress: string | null; userAgent: string | null } {
  return clientInfo(request ? { headers: request.headers } : null);
}

export function createHooks(deps: HookDeps) {
  const { db, mailer, pwned, limiter, clock, logger } = deps;

  async function findUserIdByEmail(email: string | undefined): Promise<string | null> {
    if (!email) return null;
    const [row] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email.trim().toLowerCase()))
      .limit(1);
    return row?.id ?? null;
  }

  async function accountsOf(userId: string) {
    return db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId));
  }

  async function safeRecord(...args: Parameters<typeof recordAuthEvent> extends [unknown, ...infer R] ? R : never) {
    try {
      await recordAuthEvent(db, ...args);
    } catch (err) {
      logger.error({ err }, "認証の記録に失敗した");
    }
  }

  /** hooks.before: 試行の制限、漏えいパスワード、メール変更と退会の前提の確認。 */
  const before = createAuthMiddleware(async (ctx) => {
    const path = ctx.path;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    const action = LIMITED_PATHS[path];
    if (action && typeof body.email === "string") {
      if (!(await limiter.hit(action, body.email))) throw tooManyAttempts();
    }

    const passwordField = PASSWORD_FIELDS[path];
    if (passwordField && typeof body[passwordField] === "string") {
      const result = await pwned.isCompromised(body[passwordField] as string);
      if (result === true) throw passwordCompromised();
      if (result === "unknown") logger.warn({ path }, "漏えいパスワードの確認ができなかった。確認を省いて受け付ける");
    }

    if (path === "/change-email" || path === "/delete-user") {
      const current = await getSessionFromCtx(ctx);
      if (!current) return;
      if (path === "/change-email" && !canChangeEmail(await accountsOf(current.user.id))) {
        throw emailChangeNotAllowed();
      }
      const reauthAt = (current.session as { reauthenticatedAt?: Date | string | null }).reauthenticatedAt;
      if (!isReauthFresh(reauthAt, clock.now())) throw reauthRequired();
    }
  });

  /** hooks.after: 認証の記録と、メールアドレスの変更後の通知。 */
  const after = createAuthMiddleware(async (ctx) => {
    const path = ctx.path;
    const returned = ctx.context.returned;
    // better-call はリダイレクトも APIError（302）で返す。エラーのない戻り先なら成功とみなす。
    const failed = isAPIError(returned) && !isSuccessfulRedirect(returned);
    const info = clientInfo(ctx);

    if (path === "/sign-in/email") {
      const body = (ctx.body ?? {}) as { email?: string };
      if (!failed && ctx.context.newSession) {
        await safeRecord("sign_in_succeeded", { userId: ctx.context.newSession.user.id, ...info });
      } else if (failed && (returned as { body?: { code?: string } }).body?.code !== "ACCOUNT_SUSPENDED") {
        await safeRecord("sign_in_failed", { userId: await findUserIdByEmail(body.email), ...info });
      }
      return;
    }

    if (path.startsWith("/callback/") && !failed && ctx.context.newSession) {
      await safeRecord("sign_in_succeeded", { userId: ctx.context.newSession.user.id, ...info });
      return;
    }

    if (path === "/verify-email" && !failed) {
      const token = typeof ctx.query?.token === "string" ? ctx.query.token : null;
      const payload = readVerificationToken(token);
      if (payload.requestType === "change-email-verification" && payload.email && payload.updateTo) {
        const userId = await findUserIdByEmail(payload.updateTo);
        await safeRecord("email_changed", { userId, ...info });
        try {
          // 古いアドレスへ、変更があったことを知らせる（FR-013）。
          await mailer.enqueue({
            kind: "change_email_notice",
            to: payload.email,
            url: ctx.context.baseURL.replace(/\/api\/auth$/, "/"),
            userId,
          });
        } catch (err) {
          logger.error({ err }, "変更の通知メールを登録できなかった");
        }
      }
    }
  });

  /** 確認メール（登録時とメールアドレスの変更時）。変更時は新しいアドレスに送る。 */
  async function sendVerificationEmail(data: { user: { id: string; email: string }; url: string; token: string }) {
    const payload = readVerificationToken(data.token ?? tokenFromUrl(data.url));
    const kind = payload.requestType === "change-email-verification" ? "change_email_verify" : "verify_email";
    await mailer.enqueue({ kind, to: data.user.email, url: withCallback(data.url), userId: data.user.id });
  }

  /** パスワードの再設定。Google だけのアカウントには、再設定のリンクの代わりにログインの案内を送る。 */
  async function sendResetPassword(data: { user: { id: string; email: string }; url: string; token: string }) {
    const accounts = await accountsOf(data.user.id);
    if (!hasPassword(accounts)) {
      const signInUrl = new URL("/sign-in", baseUrlOf(data.url)).toString();
      await mailer.enqueue({
        kind: "reset_password_google_only",
        to: data.user.email,
        url: signInUrl,
        userId: data.user.id,
      });
      return;
    }
    await mailer.enqueue({ kind: "reset_password", to: data.user.email, url: data.url, userId: data.user.id });
  }

  async function onPasswordReset(data: { user: { id: string } }, request?: Request) {
    await safeRecord("password_reset", { userId: data.user.id, ...requestInfo(request) });
  }

  /** 退会の直前: 認証の記録を残し、本人の確認用の値を消す。user の行は Better Auth が消し、関連データは CASCADE で消える。 */
  async function beforeDelete(u: { id: string }, request?: Request) {
    await recordAuthEvent(db, "account_deleted", { userId: u.id, ...requestInfo(request) });
    await db.delete(verification).where(eq(verification.value, u.id));
  }

  /** アカウントを作る直前: 同意の確認（FR-017）。 */
  async function beforeUserCreate(_u: unknown, ctx: RequestLike | null) {
    if (!ctx) return; // CLI やテストの内部からの作成（HTTP を通らない）
    const cookie = readCookie(ctx.headers?.get("cookie") ?? ctx.request?.headers.get("cookie"), PENDING_CONSENT_COOKIE);
    if (!isValidPendingConsent(cookie)) throw consentRequired();
  }

  /** アカウントを作った直後: 同意の履歴を記録する（FR-020）。 */
  async function afterUserCreate(u: { id: string }, ctx: RequestLike | null) {
    if (!ctx) return;
    const cookie = readCookie(ctx.headers?.get("cookie") ?? ctx.request?.headers.get("cookie"), PENDING_CONSENT_COOKIE);
    if (!isValidPendingConsent(cookie)) return;
    await db
      .insert(consents)
      .values([
        { userId: u.id, document: "terms", version: CURRENT_VERSIONS.terms },
        { userId: u.id, document: "privacy", version: CURRENT_VERSIONS.privacy },
      ])
      .onConflictDoNothing();
  }

  /** セッションを作る直前: 停止中なら拒み（FR-026）、再認証の日時を今にする（research R6）。 */
  async function beforeSessionCreate(s: { userId: string } & Record<string, unknown>, ctx: RequestLike | null) {
    const [row] = await db
      .select({ status: userTable.status })
      .from(userTable)
      .where(eq(userTable.id, s.userId))
      .limit(1);
    if (row?.status === "suspended") {
      await safeRecord("sign_in_rejected_suspended", { userId: s.userId, ...clientInfo(ctx) });
      throw accountSuspended();
    }
    return { data: { ...s, reauthenticatedAt: clock.now() } };
  }

  return {
    before,
    after,
    sendVerificationEmail,
    sendResetPassword,
    onPasswordReset,
    beforeDelete,
    beforeUserCreate,
    afterUserCreate,
    beforeSessionCreate,
  };
}

function isSuccessfulRedirect(err: unknown): boolean {
  const e = err as { statusCode?: number; headers?: Headers | Record<string, string> };
  if (e.statusCode !== 302) return false;
  const headers = e.headers instanceof Headers ? e.headers : new Headers(e.headers ?? {});
  const location = headers.get("location") ?? "";
  return !/[?&]error=/.test(location);
}

function baseUrlOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/** 確認メールのリンクの戻り先を、確認の結果の画面にする。 */
function withCallback(url: string): string {
  const u = new URL(url);
  const current = u.searchParams.get("callbackURL");
  if (!current || current === "/") u.searchParams.set("callbackURL", "/verify-email/callback");
  return u.toString();
}
