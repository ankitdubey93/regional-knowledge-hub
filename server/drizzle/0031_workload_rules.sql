ALTER TABLE "organization" ADD CONSTRAINT "organization_timezone_check" CHECK ("timezone" IS NULL OR "timezone" IN ('Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Adelaide','Australia/Darwin','Australia/Perth','Australia/Hobart','Europe/London'));
--> statement-breakpoint
ALTER TABLE "member_capacity" ADD CONSTRAINT "member_capacity_weekly_minutes_check" CHECK ("weekly_minutes" BETWEEN 0 AND 6000);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "member_capacity" TO chub_app;
--> statement-breakpoint
ALTER TABLE "member_capacity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "member_capacity" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "member_capacity_isolation" ON "member_capacity"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
