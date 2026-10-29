CREATE TABLE "engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"period_end" date,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"obligation_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "engagement_obligation_unique" UNIQUE("client_id","obligation_id")
);
--> statement-breakpoint
CREATE TABLE "engagement_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"seed_id" text,
	"steps" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"assignee_id" text,
	"due_on" date,
	"estimate_minutes" integer,
	"status" text DEFAULT 'todo' NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "auto_engagements" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_template" ADD CONSTRAINT "engagement_template_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_engagement_org_fk" FOREIGN KEY ("engagement_id","org_id") REFERENCES "public"."engagement"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_client_idx" ON "engagement" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "engagement_org_due_idx" ON "engagement" USING btree ("org_id","due_on");--> statement-breakpoint
CREATE INDEX "engagement_template_org_idx" ON "engagement_template" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "task_engagement_idx" ON "task" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "task_assignee_idx" ON "task" USING btree ("assignee_id");