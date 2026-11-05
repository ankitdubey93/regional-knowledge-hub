ALTER TABLE "chat_citation" ADD COLUMN "practice_kind" text;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "practice_params" jsonb;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "practice_as_of" timestamp with time zone;