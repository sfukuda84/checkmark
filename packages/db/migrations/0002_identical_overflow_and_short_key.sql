ALTER TABLE "trademark_results" ADD COLUMN "identical_overflow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "trademark_readings_key_head_length_idx" ON "trademark_readings" USING btree (left("reading_key", 1), length("reading_key"));
