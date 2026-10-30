-- P5c. 0001's default privileges gave chub_app UPDATE and DELETE on every new table: the audit log is append-only.
REVOKE UPDATE, DELETE ON "audit_event" FROM chub_app;
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action_check" CHECK ("action" IN ('sign_in','document.upload','document.download','document.delete','ledger.import','ledger.delete','member.invite','member.remove','member.role','retention.update','retention.purge'));
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_type_check" CHECK ("target_type" IN ('user','document','ledger_import','invitation','member','organization'));
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_retention_days_check" CHECK (("retention_days_documents" IS NULL OR "retention_days_documents" BETWEEN 30 AND 3650) AND ("retention_days_conversations" IS NULL OR "retention_days_conversations" BETWEEN 30 AND 3650));
--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_event_isolation" ON "audit_event"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
