CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"engagement_id" uuid,
	"task_id" uuid,
	"work_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"minutes" integer,
	"billable" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_one_running_idx" ON "time_entry" USING btree ("org_id","user_id") WHERE "minutes" is null;--> statement-breakpoint
CREATE INDEX "time_entry_org_user_date_idx" ON "time_entry" USING btree ("org_id","user_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entry_engagement_idx" ON "time_entry" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "time_entry_client_idx" ON "time_entry" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_id_client_org_unique" UNIQUE("id","client_id","org_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_id_org_unique" UNIQUE("id","org_id");