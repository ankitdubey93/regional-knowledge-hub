ALTER TABLE "client" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "registered_on" date;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "vat_stagger_month" smallint;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "mtd_itsa" boolean DEFAULT false NOT NULL;