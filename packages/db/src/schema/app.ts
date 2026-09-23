import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

const uuidPk = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** アカウントごとの試行の制限（data-model §6）。キーはメールアドレスのハッシュで、アドレスそのものは持たない。 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("rate_limit_buckets_expires_at_idx").on(t.expiresAt)],
);

export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** 同意の履歴（data-model §7）。 */
export const consents = pgTable(
  "consents",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    document: text("document", { enum: LEGAL_DOCUMENTS }).notNull(),
    version: text("version").notNull(),
    agreedAt: timestamp("agreed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("consents_user_document_version_idx").on(t.userId, t.document, t.version),
    check("consents_document_check", sql`${t.document} in ('terms', 'privacy')`),
  ],
);

export const AUTH_EVENT_TYPES = [
  "sign_in_succeeded",
  "sign_in_failed",
  "password_reset",
  "email_changed",
  "account_deleted",
  "sign_in_rejected_suspended",
] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

/** 認証の記録（data-model §8）。メールアドレスは持たない。退会すると user_id が NULL になる。 */
export const authEvents = pgTable(
  "auth_events",
  {
    id: uuidPk(),
    type: text("type", { enum: AUTH_EVENT_TYPES }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_events_occurred_at_idx").on(t.occurredAt),
    check(
      "auth_events_type_check",
      sql`${t.type} in ('sign_in_succeeded', 'sign_in_failed', 'password_reset', 'email_changed', 'account_deleted', 'sign_in_rejected_suspended')`,
    ),
  ],
);

export const EMAIL_KINDS = [
  "verify_email",
  "reset_password",
  "reset_password_google_only",
  "change_email_verify",
  "change_email_notice",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export const EMAIL_STATUSES = ["pending", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** 送信するメール（data-model §9）。宛先、本文、リンクは持たない。 */
export const outboundEmails = pgTable(
  "outbound_emails",
  {
    id: uuidPk(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EMAIL_KINDS }).notNull(),
    status: text("status", { enum: EMAIL_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("outbound_emails_created_at_idx").on(t.createdAt),
    check(
      "outbound_emails_kind_check",
      sql`${t.kind} in ('verify_email', 'reset_password', 'reset_password_google_only', 'change_email_verify', 'change_email_notice')`,
    ),
    check("outbound_emails_status_check", sql`${t.status} in ('pending', 'sent', 'failed')`),
  ],
);
