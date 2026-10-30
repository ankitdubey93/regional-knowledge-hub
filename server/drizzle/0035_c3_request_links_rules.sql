-- C3. Checks, RLS, the document link FKs, the public token lookup and the new audit actions.
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_token_check" CHECK (octet_length("token_hash") = 32);
--> statement-breakpoint
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_email_check" CHECK (char_length("recipient_email") BETWEEN 3 AND 254);
--> statement-breakpoint
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_cadence_check" CHECK (cardinality("cadence_days") <= 5 AND 1 <= ALL("cadence_days") AND 89 >= ALL("cadence_days"));
--> statement-breakpoint
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_nudge_count_check" CHECK ("nudge_count" BETWEEN 0 AND 5);
--> statement-breakpoint
ALTER TABLE "request_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "request_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "request_link_isolation" ON "request_link"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "request_link_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "request_link_item" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "request_link_item_isolation" ON "request_link_item"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_request_fk" FOREIGN KEY ("request_id","client_id","org_id") REFERENCES "public"."document_request"("id","client_id","org_id") ON DELETE SET NULL ("request_id");
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_request_link_fk" FOREIGN KEY ("request_link_id","client_id","org_id") REFERENCES "public"."request_link"("id","client_id","org_id") ON DELETE SET NULL ("request_link_id");
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_supersedes_fk" FOREIGN KEY ("supersedes_id","client_id","org_id") REFERENCES "public"."document"("id","client_id","org_id") ON DELETE SET NULL ("supersedes_id");
--> statement-breakpoint
CREATE INDEX "document_request_id_idx" ON "document" USING btree ("request_id");
--> statement-breakpoint
-- The only way to read request_link without app.org_id: one row for a live token, nothing else. Owned by chub (migrations run as chub).
CREATE FUNCTION "request_link_resolve"(p_token_hash bytea)
  RETURNS TABLE(org_id text, client_id uuid, link_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
  SELECT l.org_id, l.client_id, l.id
  FROM public.request_link l
  WHERE l.token_hash = p_token_hash AND l.revoked_at IS NULL AND l.expires_at > now()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "request_link_resolve"(bytea) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "request_link_resolve"(bytea) TO chub_app;
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_action_check";
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action_check" CHECK ("action" IN ('sign_in','document.upload','document.download','document.delete','ledger.import','ledger.delete','member.invite','member.remove','member.role','retention.update','retention.purge','request_link.create','request_link.pause','request_link.resume','request_link.revoke','request_link.nudge'));
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_target_type_check";
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_type_check" CHECK ("target_type" IN ('user','document','ledger_import','invitation','member','organization','request_link'));
