CREATE TABLE "client_pricing" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"model" text NOT NULL,
	"currency" text NOT NULL,
	"fixed_cents" integer,
	"retainer_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid,
	"number" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"tax_scheme" text NOT NULL,
	"tax_fact_key" text,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"buyer_address" text DEFAULT '' NOT NULL,
	"buyer_tax_number" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"issued_on" date,
	"due_on" date,
	"seller_jurisdiction" text,
	"seller_name" text,
	"seller_address" text,
	"seller_tax_number" text,
	"buyer_name" text,
	"payment_details" text,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"no_tax_subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"fx_rate_micros" bigint,
	"fx_rate_date" date,
	"fx_rate_source" text,
	"tax_home_cents" bigint,
	"total_home_cents" bigint,
	"issued_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "invoice_id_client_org_unique" UNIQUE("id","client_id","org_id"),
	CONSTRAINT "invoice_org_number_unique" UNIQUE("org_id","number")
);
--> statement-breakpoint
CREATE TABLE "invoice_counter" (
	"org_id" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"time_entry_id" uuid,
	"minutes" integer,
	"unit_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_treatment" text NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"currency" text NOT NULL,
	"cents_per_hour" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_jurisdiction" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_legal_name" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_tax_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_tax_number" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_payment_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_payment_details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "billing_account_code" text DEFAULT '200' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_pricing" ADD CONSTRAINT "client_pricing_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_pricing" ADD CONSTRAINT "client_pricing_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counter" ADD CONSTRAINT "invoice_counter_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_org_fk" FOREIGN KEY ("invoice_id","org_id") REFERENCES "public"."invoice"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_client_idx" ON "invoice" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoice_org_created_idx" ON "invoice" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_line_invoice_idx" ON "invoice_line" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_line_time_entry_idx" ON "invoice_line" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "rate_card_org_idx" ON "rate_card" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_id_org_unique" UNIQUE("id","org_id");