GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_bucket" TO chub_app;
--> statement-breakpoint
ALTER TABLE "rate_bucket" ADD CONSTRAINT "rate_bucket_count_check" CHECK ("count" >= 1);
