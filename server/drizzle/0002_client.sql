CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"entities" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_org_idx" ON "client" USING btree ("org_id");