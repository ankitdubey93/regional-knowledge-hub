ALTER TABLE "conversation" ADD CONSTRAINT "conversation_scope_check" CHECK ("scope" IS NULL OR "scope" IN ('AU', 'UK', 'ALL'));
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_client_or_scope_check" CHECK (("client_id" IS NULL) = ("scope" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_role_check" CHECK ("role" IN ('user', 'assistant'));
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_status_check" CHECK ("status" IN ('sent', 'answered', 'flagged', 'not_covered', 'refused', 'stopped', 'error'));
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_role_status_check" CHECK (("role" = 'user') = ("status" = 'sent'));
--> statement-breakpoint
ALTER TABLE "conversation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversation_isolation" ON "conversation"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_message" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "chat_message_isolation" ON "chat_message"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "chat_citation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_citation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "chat_citation_isolation" ON "chat_citation"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
-- Spend records are append-only for the app role.
REVOKE UPDATE, DELETE ON "ai_usage" FROM chub_app;
