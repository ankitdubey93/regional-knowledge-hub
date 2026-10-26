ALTER TABLE "organization" ADD CONSTRAINT "organization_kind_check" CHECK ("kind" IN ('business', 'practice'));
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_entity_type_check" CHECK ("entity_type" IN ('sole_trader', 'partnership', 'company', 'trust', 'llp'));
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_tax_period_check" CHECK ("tax_period" IN ('monthly', 'quarterly', 'annual'));
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_tax_period_registered_check" CHECK ("tax_registered" OR "tax_period" IS NULL);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_fy_end_month_check" CHECK ("fy_end_month" BETWEEN 1 AND 12);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_entity_jurisdiction_check" CHECK (NOT ("entity_type" = 'trust' AND "jurisdiction" = 'UK') AND NOT ("entity_type" = 'llp' AND "jurisdiction" = 'AU'));
--> statement-breakpoint
CREATE UNIQUE INDEX "client_one_self_per_org" ON "client" ("org_id") WHERE "is_self";
