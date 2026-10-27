ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_source_check" CHECK ("source" IN ('xero', 'qbo', 'myob', 'other'));
--> statement-breakpoint
ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_currency_check" CHECK ("currency" IN ('AUD', 'GBP'));
--> statement-breakpoint
ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_status_check" CHECK ("status" IN ('active', 'superseded'));
--> statement-breakpoint
ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_period_check" CHECK ("period_start" <= "as_at");
--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_class_check" CHECK ("account_class" IN ('current_asset', 'non_current_asset', 'current_liability', 'non_current_liability', 'equity', 'revenue', 'other_income', 'cost_of_sales', 'operating_expense', 'other_expense'));
--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_class_set_by_check" CHECK ("class_set_by" IN ('import', 'user'));
--> statement-breakpoint
ALTER TABLE "ledger_balance" ADD CONSTRAINT "ledger_balance_amount_check" CHECK ("debit_cents" >= 0 AND "credit_cents" >= 0 AND NOT ("debit_cents" > 0 AND "credit_cents" > 0));
--> statement-breakpoint
ALTER TABLE "ledger_import" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger_import" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ledger_import_isolation" ON "ledger_import"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "ledger_account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger_account" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ledger_account_isolation" ON "ledger_account"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "ledger_balance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger_balance" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ledger_balance_isolation" ON "ledger_balance"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
