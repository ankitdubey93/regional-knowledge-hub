-- B2. Checks, the SET NULL foreign keys drizzle cannot express, RLS, grants and the lock triggers.
-- Updates to issued invoices, their lines and invoiced time are refused by triggers; deletes are service checks,
-- because the organization cascade must still delete every row.
ALTER TABLE "organization" ADD CONSTRAINT "organization_billing_check" CHECK (
  ("billing_jurisdiction" IS NULL OR "billing_jurisdiction" IN ('AU','UK'))
  AND ("billing_legal_name" IS NULL OR char_length("billing_legal_name") BETWEEN 1 AND 200)
  AND ("billing_address" IS NULL OR char_length("billing_address") BETWEEN 1 AND 500)
  AND ("billing_tax_number" IS NULL OR char_length("billing_tax_number") BETWEEN 1 AND 40)
  AND "billing_payment_days" BETWEEN 0 AND 120
  AND char_length("billing_payment_details") <= 500
  AND char_length("billing_account_code") BETWEEN 1 AND 10
  AND (NOT "billing_tax_registered" OR ("billing_jurisdiction" IS NOT NULL AND "billing_tax_number" IS NOT NULL)));
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_card_who_currency_idx" ON "rate_card" ("org_id","user_id","currency") NULLS NOT DISTINCT;
--> statement-breakpoint
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_cents_check" CHECK ("cents_per_hour" BETWEEN 0 AND 1000000);
--> statement-breakpoint
ALTER TABLE "client_pricing" ADD CONSTRAINT "client_pricing_amounts_check" CHECK (
  ("fixed_cents" IS NULL OR "fixed_cents" BETWEEN 0 AND 100000000)
  AND ("retainer_cents" IS NULL OR "retainer_cents" BETWEEN 0 AND 100000000)
  AND ("model" <> 'fixed' OR "fixed_cents" IS NOT NULL)
  AND ("model" <> 'retainer' OR "retainer_cents" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_number_check" CHECK ((("status" = 'draft') = ("number" IS NULL)) AND ("number" IS NULL OR "number" >= 1));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_issued_check" CHECK ("status" = 'draft' OR ("issued_on" IS NOT NULL AND "due_on" IS NOT NULL AND "seller_jurisdiction" IN ('AU','UK') AND "seller_name" IS NOT NULL AND "seller_address" IS NOT NULL AND "buyer_name" IS NOT NULL AND "payment_details" IS NOT NULL AND "issued_by" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_void_check" CHECK ((("status" = 'void') = ("voided_at" IS NOT NULL)) AND (("status" = 'void') = ("void_reason" IS NOT NULL)));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tax_check" CHECK ((("tax_scheme" = 'none') = ("tax_fact_key" IS NULL)) AND "tax_rate_bp" BETWEEN 0 AND 10000 AND ("tax_scheme" <> 'none' OR "tax_rate_bp" = 0));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_period_check" CHECK ("period_from" <= "period_to");
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_fx_check" CHECK (
  (("fx_rate_micros" IS NULL) = ("fx_rate_date" IS NULL)) AND (("fx_rate_micros" IS NULL) = ("fx_rate_source" IS NULL))
  AND ("fx_rate_micros" IS NULL OR "fx_rate_micros" BETWEEN 1 AND 10000000)
  AND ("fx_rate_micros" IS NOT NULL OR ("tax_home_cents" IS NULL AND "total_home_cents" IS NULL)));
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_amounts_check" CHECK ("subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "no_tax_subtotal_cents" >= 0 AND "total_cents" = "subtotal_cents" + "tax_cents" AND "total_cents" <= 500000000);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_text_check" CHECK (char_length("buyer_address") <= 500 AND char_length("buyer_tax_number") <= 40 AND char_length("reference") <= 100 AND char_length("notes") <= 1000 AND ("fx_rate_source" IS NULL OR char_length("fx_rate_source") BETWEEN 1 AND 200) AND ("void_reason" IS NULL OR char_length("void_reason") BETWEEN 1 AND 500));
--> statement-breakpoint
-- A fixed fee's engagement must be the same entity's; deleting the engagement keeps the invoice.
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_engagement_fk" FOREIGN KEY ("engagement_id","client_id","org_id") REFERENCES "public"."engagement"("id","client_id","org_id") ON DELETE SET NULL ("engagement_id");
--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_check" CHECK (char_length("description") BETWEEN 1 AND 500 AND "position" >= 1 AND "amount_cents" BETWEEN 0 AND 100000000 AND "unit_cents" BETWEEN 0 AND 100000000 AND "tax_cents" >= 0 AND (("kind" = 'time') = ("minutes" IS NOT NULL)) AND ("minutes" IS NULL OR "minutes" BETWEEN 1 AND 1440));
--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_time_entry_fk" FOREIGN KEY ("time_entry_id","org_id") REFERENCES "public"."time_entry"("id","org_id") ON DELETE SET NULL ("time_entry_id");
--> statement-breakpoint
-- B1 debt: an entry can only be on an invoice of its own entity; deleting a draft releases the entry.
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_invoice_fk" FOREIGN KEY ("invoice_id","client_id","org_id") REFERENCES "public"."invoice"("id","client_id","org_id") ON DELETE SET NULL ("invoice_id");
--> statement-breakpoint
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_next_check" CHECK ("next_number" >= 1);
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_action_check";
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_action_check" CHECK ("action" IN ('sign_in','document.upload','document.download','document.delete','ledger.import','ledger.delete','member.invite','member.remove','member.role','retention.update','retention.purge','request_link.create','request_link.pause','request_link.resume','request_link.revoke','request_link.nudge','invoice.issue','invoice.void'));
--> statement-breakpoint
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_target_type_check";
--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_target_type_check" CHECK ("target_type" IN ('user','document','ledger_import','invitation','member','organization','request_link','invoice'));
--> statement-breakpoint
CREATE FUNCTION "time_entry_invoice_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."invoice_id" IS NOT NULL AND (NEW."user_id", NEW."client_id", NEW."work_date", NEW."minutes", NEW."billable", NEW."note")
     IS DISTINCT FROM (OLD."user_id", OLD."client_id", OLD."work_date", OLD."minutes", OLD."billable", OLD."note") THEN
    RAISE EXCEPTION 'time entry % is on an invoice and cannot be changed', OLD."id";
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "time_entry_invoice_guard" BEFORE UPDATE ON "time_entry" FOR EACH ROW EXECUTE FUNCTION "time_entry_invoice_guard"();
--> statement-breakpoint
-- Issued may become void (status, voided_at, void_reason, updated_at). engagement_id may change only through invoice_engagement_fk's SET NULL.
CREATE FUNCTION "invoice_issued_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD."status" = 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'issued' AND NEW."status" = 'void'
     AND (to_jsonb(NEW) - ARRAY['status','voided_at','void_reason','updated_at','engagement_id']) = (to_jsonb(OLD) - ARRAY['status','voided_at','void_reason','updated_at','engagement_id']) THEN
    RETURN NEW;
  END IF;
  IF NEW."engagement_id" IS NULL AND (to_jsonb(NEW) - 'engagement_id') = (to_jsonb(OLD) - 'engagement_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invoice % is %, so it cannot be changed', OLD."id", OLD."status";
END $$;
--> statement-breakpoint
CREATE TRIGGER "invoice_issued_guard" BEFORE UPDATE ON "invoice" FOR EACH ROW EXECUTE FUNCTION "invoice_issued_guard"();
--> statement-breakpoint
-- time_entry_id may become null through invoice_line_time_entry_fk's SET NULL even on an issued or void invoice.
CREATE FUNCTION "invoice_line_draft_guard"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."time_entry_id" IS NULL AND (to_jsonb(NEW) - 'time_entry_id') = (to_jsonb(OLD) - 'time_entry_id') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "public"."invoice" WHERE "id" = NEW."invoice_id" AND "status" <> 'draft') THEN
    RAISE EXCEPTION 'invoice % is not a draft, so its lines cannot be changed', NEW."invoice_id";
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER "invoice_line_draft_guard" BEFORE INSERT OR UPDATE ON "invoice_line" FOR EACH ROW EXECUTE FUNCTION "invoice_line_draft_guard"();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_card", "client_pricing", "invoice", "invoice_line" TO chub_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "invoice_counter" TO chub_app;
--> statement-breakpoint
REVOKE DELETE ON "invoice_counter" FROM chub_app;
--> statement-breakpoint
ALTER TABLE "rate_card" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_card" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rate_card_isolation" ON "rate_card"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "client_pricing" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_pricing" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "client_pricing_isolation" ON "client_pricing"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoice_isolation" ON "invoice"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "invoice_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoice_line_isolation" ON "invoice_line"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "invoice_counter" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_counter" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoice_counter_isolation" ON "invoice_counter"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
