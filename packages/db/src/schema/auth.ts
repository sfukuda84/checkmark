import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const USER_ROLES = ["user", "operator"] as const;
export const USER_STATUSES = ["active", "suspended"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

/** アカウント（data-model §1）。Better Auth の user モデル。 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role", { enum: USER_ROLES }).notNull().default("user"),
    status: text("status", { enum: USER_STATUSES }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("user_email_verified_created_at_idx").on(t.emailVerified, t.createdAt),
    check("user_role_check", sql`${t.role} in ('user', 'operator')`),
    check("user_status_check", sql`${t.status} in ('active', 'suspended')`),
  ],
);

/** ログイン状態（data-model §2）。 */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

/** ログイン手段（data-model §3）。 */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("account_provider_account_idx").on(t.providerId, t.accountId),
    index("account_user_id_idx").on(t.userId),
  ],
);

/** 確認用のリンク（data-model §4）。 */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** 接続元ごとの試行の制限（data-model §5）。Better Auth の rateLimit モデル。 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
