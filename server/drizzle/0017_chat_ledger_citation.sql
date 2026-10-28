ALTER TABLE "chat_citation" ALTER COLUMN "source_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_citation" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_citation" ALTER COLUMN "chunk_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "ledger_import_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "ledger_compare_import_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "ledger_report" text;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD COLUMN "ledger_as_at" date;