ALTER TABLE "client" ADD CONSTRAINT "client_timezone_check" CHECK ("timezone" IS NULL OR "timezone" IN ('Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Adelaide','Australia/Darwin','Australia/Perth','Australia/Hobart','Europe/London'));
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_vat_stagger_month_check" CHECK ("vat_stagger_month" BETWEEN 1 AND 12);
