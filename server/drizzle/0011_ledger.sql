CREATE TABLE "ledger_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_type" text DEFAULT '' NOT NULL,
	"account_class" text NOT NULL,
	"class_set_by" text DEFAULT 'import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"import_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_cents" bigint NOT NULL,
	"credit_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"source" text NOT NULL,
	"currency" text NOT NULL,
	"as_at" date NOT NULL,
	"period_start" date NOT NULL,
	"original_name" text NOT NULL,
	"sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"total_debit_cents" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_import_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_id_org_unique" UNIQUE("id","org_id");--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_balance" ADD CONSTRAINT "ledger_balance_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_balance" ADD CONSTRAINT "ledger_balance_import_org_fk" FOREIGN KEY ("import_id","org_id") REFERENCES "public"."ledger_import"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_balance" ADD CONSTRAINT "ledger_balance_account_org_fk" FOREIGN KEY ("account_id","org_id") REFERENCES "public"."ledger_account"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_import" ADD CONSTRAINT "ledger_import_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_client_code_idx" ON "ledger_account" USING btree ("client_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_balance_import_account_idx" ON "ledger_balance" USING btree ("import_id","account_id");--> statement-breakpoint
CREATE INDEX "ledger_import_org_idx" ON "ledger_import" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ledger_import_client_idx" ON "ledger_import" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_import_one_active_per_date" ON "ledger_import" USING btree ("client_id","as_at") WHERE status = 'active';
