CREATE TABLE "member_capacity" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"weekly_minutes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_capacity_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;