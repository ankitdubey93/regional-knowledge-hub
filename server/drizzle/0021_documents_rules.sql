ALTER TABLE "document" ADD CONSTRAINT "document_kind_check" CHECK ("kind" IN ('pdf', 'docx', 'xlsx', 'csv', 'text', 'markdown'));
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_size_check" CHECK ("byte_size" > 0 AND "text_chars" >= 0);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_isolation" ON "document"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "conversation_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation_document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversation_document_isolation" ON "conversation_document"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
