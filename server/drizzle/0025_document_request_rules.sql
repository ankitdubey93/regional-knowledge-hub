ALTER TABLE "document_request" ADD CONSTRAINT "document_request_status_check" CHECK ("status" IN ('open', 'received', 'waived'));
--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_source_check" CHECK ("source" IN ('rule', 'manual', 'obligation'));
--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_obligation_check" CHECK ((("source" = 'obligation') = ("obligation_id" IS NOT NULL)) AND ("source" <> 'obligation' OR "due_on" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_label_check" CHECK (char_length("label") BETWEEN 1 AND 300);
--> statement-breakpoint
ALTER TABLE "document_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_request_isolation" ON "document_request"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
