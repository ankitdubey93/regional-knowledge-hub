CREATE TABLE "document_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"label" text NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	"doc_id" text,
	"source_url" text,
	"verified_on" date,
	"due_on" date,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text NOT NULL,
	"obligation_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_request_item_unique" UNIQUE NULLS NOT DISTINCT("client_id","item_id","obligation_id")
);
--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_request_client_idx" ON "document_request" USING btree ("client_id");