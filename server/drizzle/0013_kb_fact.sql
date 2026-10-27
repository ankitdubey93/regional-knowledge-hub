CREATE TABLE "kb_fact" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"unit" text NOT NULL,
	"value_num" bigint,
	"value_text" text,
	"effective_from" date NOT NULL,
	"source" text NOT NULL,
	"verified_on" date,
	"note" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_fact_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_key" text NOT NULL,
	"fact" jsonb NOT NULL,
	"change_note" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kb_source" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "kb_fact_history" ADD CONSTRAINT "kb_fact_history_fact_key_kb_fact_key_fk" FOREIGN KEY ("fact_key") REFERENCES "public"."kb_fact"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_fact_history_key_idx" ON "kb_fact_history" USING btree ("fact_key","changed_at");