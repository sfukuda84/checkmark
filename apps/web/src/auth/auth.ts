import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { account, rateLimit, session, user, verification, type Database } from "@app/db";
import { DAY } from "@app/shared/time";
import { serverEnv } from "@app/shared/env";
import { createLogger } from "@app/shared/logger";
import { systemClock, type Clock } from "@app/shared/time";
import type { EmailEnqueuer } from "@/jobs/client";
import type { PwnedPasswordChecker } from "./pwned";
import type { AccountRateLimiter } from "./rate-limit";
import { createHooks } from "./hooks";
import { toBetterAuthLogger } from "./logger";

export interface AuthDeps {
  db: Database;
  mailer: EmailEnqueuer;
  pwned: PwnedPasswordChecker;
  limiter: AccountRateLimiter;
  clock?: Clock;
  env?: NodeJS.ProcessEnv;
}

export const AUTH_BASE_PATH = "/api/auth";

/** Better Auth の設定（research R3〜R9）。依存を注入して、結合テストで差し替えられるようにする。 */
export function createAuth(deps: AuthDeps) {
  const env = serverEnv(deps.env ?? process.env);
  const clock = deps.clock ?? systemClock;
  const logger = createLogger({ name: "auth" });
  const hooks = createHooks({ ...deps, clock, logger, supportContact: env.SUPPORT_CONTACT });

  const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    appName: "ネーミングチェッカー",
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 時間（FR-010）
      revokeSessionsOnPasswordReset: true, // FR-011
      sendResetPassword: hooks.sendResetPassword,
      onPasswordReset: hooks.onPasswordReset,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60, // 24 時間（FR-003）
      sendVerificationEmail: hooks.sendVerificationEmail,
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        // Google 側で確認済みのメールアドレスだけを結びつける（FR-005a）。trustedProviders は使わない。
        trustedProviders: [],
        allowDifferentEmails: false,
      },
    },
    user: {
      changeEmail: { enabled: true, updateEmailWithoutVerification: false },
      deleteUser: { enabled: true, beforeDelete: hooks.beforeDelete },
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
      },
    },
    session: {
      expiresIn: (30 * DAY) / 1000, // 最後の延長から 30 日（FR-008a）
      updateAge: DAY / 1000,
      freshAge: 0, // 再認証は hooks で判定する（research R6）
      additionalFields: {
        reauthenticatedAt: { type: "date", required: false, input: false },
      },
    },
    rateLimit: {
      enabled: env.NODE_ENV !== "test" || process.env.AUTH_RATE_LIMIT === "1",
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 900, max: 10 },
        "/request-password-reset": { window: 900, max: 10 },
        "/send-verification-email": { window: 3600, max: 3 },
        "/verify-password": { window: 900, max: 10 },
      },
    },
    advanced: {
      ipAddress: { trustedProxies: env.TRUSTED_PROXY_IPS },
      useSecureCookies: env.NODE_ENV === "production",
    },
    databaseHooks: {
      user: { create: { before: hooks.beforeUserCreate, after: hooks.afterUserCreate } },
      session: { create: { before: hooks.beforeSessionCreate } },
    },
    hooks: { before: hooks.before, after: hooks.after },
    plugins: [nextCookies()],
    logger: toBetterAuthLogger(logger, env.NODE_ENV === "test" ? "error" : "warn"),
  });
}

export type Auth = ReturnType<typeof createAuth>;
