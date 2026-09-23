import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const DATASET_STATUSES = ["importing", "active", "failed"] as const;
export type DatasetStatus = (typeof DATASET_STATUSES)[number];
export const DATASET_MODES = ["full", "delta"] as const;
export type DatasetMode = (typeof DATASET_MODES)[number];
export const MARK_STATUSES = ["pending", "registered"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

/** 商標データの取り込みの 1 回分（001 data-model §1）。照合には最新の active を使う。 */
export const trademarkDatasets = pgTable(
  "trademark_datasets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: text("source").notNull(),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    mode: text("mode", { enum: DATASET_MODES }).notNull(),
    rowCount: integer("row_count").notNull().default(0),
    status: text("status", { enum: DATASET_STATUSES }).notNull(),
  },
  (t) => [
    index("trademark_datasets_status_imported_at_idx").on(t.status, t.importedAt),
    check("trademark_datasets_status_check", sql`${t.status} in ('importing', 'active', 'failed')`),
    check("trademark_datasets_mode_check", sql`${t.mode} in ('full', 'delta')`),
  ],
);

/** 権利が存続している文字商標（001 data-model §2、FR-010a）。 */
export const trademarkMarks = pgTable(
  "trademark_marks",
  {
    applicationNumber: text("application_number").primaryKey(),
    registrationNumber: text("registration_number"),
    markText: text("mark_text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    holderName: text("holder_name").notNull(),
    classes: smallint("classes").array().notNull(),
    status: text("status", { enum: MARK_STATUSES }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("trademark_marks_normalized_text_idx").on(t.normalizedText),
    index("trademark_marks_classes_idx").using("gin", t.classes),
    check("trademark_marks_status_check", sql`${t.status} in ('pending', 'registered')`),
  ],
);

/** 称呼（001 data-model §3）。reading_key の索引（trgm と text_pattern_ops）はマイグレーションで足す。 */
export const trademarkReadings = pgTable(
  "trademark_readings",
  {
    applicationNumber: text("application_number")
      .notNull()
      .references(() => trademarkMarks.applicationNumber, { onDelete: "cascade" }),
    reading: text("reading").notNull(),
    readingKey: text("reading_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.applicationNumber, t.reading] })],
);
