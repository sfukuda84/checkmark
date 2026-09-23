CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "trademark_datasets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"as_of_date" date NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "trademark_datasets_status_check" CHECK ("trademark_datasets"."status" in ('importing', 'active', 'failed')),
	CONSTRAINT "trademark_datasets_mode_check" CHECK ("trademark_datasets"."mode" in ('full', 'delta'))
);
--> statement-breakpoint
CREATE TABLE "trademark_marks" (
	"application_number" text PRIMARY KEY NOT NULL,
	"registration_number" text,
	"mark_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"holder_name" text NOT NULL,
	"classes" smallint[] NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trademark_marks_status_check" CHECK ("trademark_marks"."status" in ('pending', 'registered'))
);
--> statement-breakpoint
CREATE TABLE "trademark_readings" (
	"application_number" text NOT NULL,
	"reading" text NOT NULL,
	"reading_key" text NOT NULL,
	CONSTRAINT "trademark_readings_application_number_reading_pk" PRIMARY KEY("application_number","reading")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"check_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"input_text" text NOT NULL,
	"user_reading" text,
	"normalized_text" text NOT NULL,
	"reading" text,
	"reading_estimated" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"charged" boolean NOT NULL,
	"charged_period" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_candidates_status_check" CHECK ("check_candidates"."status" in ('queued', 'running', 'done', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"classes" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trademark_results" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"outcome" text NOT NULL,
	"matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dataset_as_of" date,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reading_unavailable" boolean DEFAULT false NOT NULL,
	"error_code" text,
	CONSTRAINT "trademark_results_outcome_check" CHECK ("trademark_results"."outcome" in ('identical', 'similar', 'none', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_period_pk" PRIMARY KEY("user_id","period"),
	CONSTRAINT "usage_counters_used_check" CHECK ("usage_counters"."used" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trademark_readings" ADD CONSTRAINT "trademark_readings_application_number_trademark_marks_application_number_fk" FOREIGN KEY ("application_number") REFERENCES "public"."trademark_marks"("application_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_candidates" ADD CONSTRAINT "check_candidates_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trademark_results" ADD CONSTRAINT "trademark_results_candidate_id_check_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."check_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trademark_datasets_status_imported_at_idx" ON "trademark_datasets" USING btree ("status","imported_at");--> statement-breakpoint
CREATE INDEX "trademark_marks_normalized_text_idx" ON "trademark_marks" USING btree ("normalized_text");--> statement-breakpoint
CREATE INDEX "trademark_marks_classes_idx" ON "trademark_marks" USING gin ("classes");--> statement-breakpoint
CREATE UNIQUE INDEX "check_candidates_check_position_idx" ON "check_candidates" USING btree ("check_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "check_candidates_check_normalized_idx" ON "check_candidates" USING btree ("check_id","normalized_text");--> statement-breakpoint
CREATE INDEX "check_candidates_status_deadline_idx" ON "check_candidates" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "checks_user_created_at_idx" ON "checks" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trademark_readings_reading_key_trgm_idx" ON "trademark_readings" USING gin ("reading_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "trademark_readings_reading_key_pattern_idx" ON "trademark_readings" USING btree ("reading_key" text_pattern_ops);
