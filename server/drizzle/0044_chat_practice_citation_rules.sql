ALTER TABLE "chat_citation" DROP CONSTRAINT "chat_citation_kind_check";
--> statement-breakpoint
ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_kind_check" CHECK ("kind" IN ('act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum', 'ledger', 'practice'));
--> statement-breakpoint
ALTER TABLE "chat_citation" DROP CONSTRAINT "chat_citation_source_check";
--> statement-breakpoint
ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_source_check" CHECK (
  CASE
    WHEN "kind" = 'ledger' THEN
      "ledger_import_id" IS NOT NULL AND "ledger_report" IN ('pnl', 'bs') AND "ledger_as_at" IS NOT NULL
      AND "source_id" IS NULL AND "version_id" IS NULL AND "chunk_id" IS NULL
      AND "practice_kind" IS NULL AND "practice_params" IS NULL AND "practice_as_of" IS NULL
    WHEN "kind" = 'practice' THEN
      "practice_kind" IN ('due_soon', 'over_capacity', 'unbilled_time', 'open_engagements', 'outstanding_requests')
      AND "practice_params" IS NOT NULL AND jsonb_typeof("practice_params") = 'object' AND "practice_as_of" IS NOT NULL
      AND "source_id" IS NULL AND "version_id" IS NULL AND "chunk_id" IS NULL
      AND "ledger_import_id" IS NULL AND "ledger_compare_import_id" IS NULL AND "ledger_report" IS NULL AND "ledger_as_at" IS NULL
    ELSE
      "source_id" IS NOT NULL AND "version_id" IS NOT NULL AND "chunk_id" IS NOT NULL
      AND "ledger_import_id" IS NULL AND "ledger_compare_import_id" IS NULL AND "ledger_report" IS NULL AND "ledger_as_at" IS NULL
      AND "practice_kind" IS NULL AND "practice_params" IS NULL AND "practice_as_of" IS NULL
  END
);
