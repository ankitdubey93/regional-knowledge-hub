ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_kind_check" CHECK ("kind" IN ('act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum', 'ledger'));
--> statement-breakpoint
ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_source_check" CHECK (
  CASE WHEN "kind" = 'ledger'
    THEN "ledger_import_id" IS NOT NULL AND "ledger_report" IN ('pnl', 'bs') AND "ledger_as_at" IS NOT NULL
         AND "source_id" IS NULL AND "version_id" IS NULL AND "chunk_id" IS NULL
    ELSE "source_id" IS NOT NULL AND "version_id" IS NOT NULL AND "chunk_id" IS NOT NULL
         AND "ledger_import_id" IS NULL AND "ledger_compare_import_id" IS NULL AND "ledger_report" IS NULL AND "ledger_as_at" IS NULL
  END
);
