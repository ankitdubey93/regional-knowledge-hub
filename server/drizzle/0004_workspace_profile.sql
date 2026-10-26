ALTER TABLE "client" ADD COLUMN "is_self" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "tax_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "tax_period" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "fy_end_month" smallint;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "kind" text DEFAULT 'practice' NOT NULL;