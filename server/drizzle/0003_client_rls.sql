ALTER TABLE "client" ADD CONSTRAINT "client_jurisdiction_check" CHECK ("jurisdiction" IN ('AU', 'UK', 'AU+UK'));
--> statement-breakpoint
ALTER TABLE "client" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "client_isolation" ON "client"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
