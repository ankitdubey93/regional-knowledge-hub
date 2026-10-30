CREATE TABLE "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"ip_key" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "retention_days_documents" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "retention_days_conversations" integer;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_org_id_idx" ON "audit_event" USING btree ("org_id","id");