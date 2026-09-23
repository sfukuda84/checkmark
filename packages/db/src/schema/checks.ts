import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import type { MarkStatus } from "./trademarks";

const uuidPk = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** 一括チェック（001 data-model §4）。状態は候補から導く。 */
export const checks = pgTable(
  "checks",
  {
    id: uuidPk(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    classes: smallint("classes")
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("checks_user_created_at_idx").on(t.userId, t.createdAt.desc())],
);

export const CANDIDATE_STATUSES = ["queued", "running", "done", "unknown"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** チェックに含まれる候補（001 data-model §5）。 */
export const checkCandidates = pgTable(
  "check_candidates",
  {
    id: uuidPk(),
    checkId: uuid("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    inputText: text("input_text").notNull(),
    userReading: text("user_reading"),
    normalizedText: text("normalized_text").notNull(),
    reading: text("reading"),
    readingEstimated: boolean("reading_estimated").notNull().default(false),
    status: text("status", { enum: CANDIDATE_STATUSES }).notNull().default("queued"),
    attempt: smallint("attempt").notNull().default(1),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }).notNull(),
    charged: boolean("charged").notNull(),
    chargedPeriod: text("charged_period").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("check_candidates_check_position_idx").on(t.checkId, t.position),
    uniqueIndex("check_candidates_check_normalized_idx").on(t.checkId, t.normalizedText),
    index("check_candidates_status_deadline_idx").on(t.status, t.deadlineAt),
    check("check_candidates_status_check", sql`${t.status} in ('queued', 'running', 'done', 'unknown')`),
  ],
);

export const TRADEMARK_OUTCOMES = ["identical", "similar", "none", "unknown"] as const;
export type TrademarkOutcome = (typeof TRADEMARK_OUTCOMES)[number];
export const TRADEMARK_ERROR_CODES = ["TIMEOUT", "NO_DATASET", "FAILED"] as const;
export type TrademarkErrorCode = (typeof TRADEMARK_ERROR_CODES)[number];

/** 該当商標の写し（調べた時点のもの。憲章 IV）。 */
export interface TrademarkMatch {
  kind: "identical" | "similar";
  applicationNumber: string;
  registrationNumber: string | null;
  markText: string;
  reading: string | null;
  holderName: string;
  classes: number[];
  status: MarkStatus;
  score: number;
}

/** 候補ごとの商標照合結果（001 data-model §6）。 */
export const trademarkResults = pgTable(
  "trademark_results",
  {
    candidateId: uuid("candidate_id")
      .primaryKey()
      .references(() => checkCandidates.id, { onDelete: "cascade" }),
    outcome: text("outcome", { enum: TRADEMARK_OUTCOMES }).notNull(),
    matches: jsonb("matches").$type<TrademarkMatch[]>().notNull().default([]),
    datasetAsOf: date("dataset_as_of", { mode: "string" }),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    readingUnavailable: boolean("reading_unavailable").notNull().default(false),
    identicalOverflow: boolean("identical_overflow").notNull().default(false),
    errorCode: text("error_code", { enum: TRADEMARK_ERROR_CODES }),
  },
  (t) => [check("trademark_results_outcome_check", sql`${t.outcome} in ('identical', 'similar', 'none', 'unknown')`)],
);

/** 利用者・期間（YYYY-MM、日本時間）ごとの利用回数（001 data-model §7）。 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    used: integer("used").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period] }), check("usage_counters_used_check", sql`${t.used} >= 0`)],
);

/** 運営者が変えられる設定（001 data-model §8）。 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const SETTING_KEYS = { monthlyCandidateLimit: "usage.monthly_candidate_limit" } as const;
