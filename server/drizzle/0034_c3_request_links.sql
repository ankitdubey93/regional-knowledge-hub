CREATE TABLE "request_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"token_enc" "bytea" NOT NULL,
	"recipient_email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"paused" boolean DEFAULT false NOT NULL,
	"cadence_days" integer[] DEFAULT '{3,7,14}'::integer[] NOT NULL,
	"nudge_count" integer DEFAULT 0 NOT NULL,
	"last_nudged_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_link_id_client_org_unique" UNIQUE("id","client_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "request_link_item" (
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	CONSTRAINT "request_link_item_pk" PRIMARY KEY("link_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "request_link_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "supersedes_id" uuid;--> statement-breakpoint
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_link" ADD CONSTRAINT "request_link_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_link_item" ADD CONSTRAINT "request_link_item_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_link_item" ADD CONSTRAINT "request_link_item_link_fk" FOREIGN KEY ("link_id","client_id","org_id") REFERENCES "public"."request_link"("id","client_id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_request" ADD CONSTRAINT "document_request_id_client_org_unique" UNIQUE("id","client_id","org_id");--> statement-breakpoint
ALTER TABLE "request_link_item" ADD CONSTRAINT "request_link_item_request_fk" FOREIGN KEY ("request_id","client_id","org_id") REFERENCES "public"."document_request"("id","client_id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_link_token_hash_idx" ON "request_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "request_link_client_idx" ON "request_link" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "request_link_item_request_idx" ON "request_link_item" USING btree ("request_id");