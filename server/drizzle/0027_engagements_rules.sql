ALTER TABLE "engagement_template" ADD CONSTRAINT "engagement_template_kind_check" CHECK ("kind" IN ('bookkeeping', 'bas', 'vat', 'year_end', 'payroll', 'other'));
--> statement-breakpoint
ALTER TABLE "engagement_template" ADD CONSTRAINT "engagement_template_name_check" CHECK (char_length("name") BETWEEN 1 AND 120);
--> statement-breakpoint
ALTER TABLE "engagement_template" ADD CONSTRAINT "engagement_template_steps_check" CHECK (jsonb_typeof("steps") = 'array');
--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_kind_check" CHECK ("kind" IN ('bookkeeping', 'bas', 'vat', 'year_end', 'payroll', 'other'));
--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_status_check" CHECK ("status" IN ('planned', 'in_progress', 'review', 'done'));
--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_title_check" CHECK (char_length("title") BETWEEN 1 AND 200);
--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_template_id_check" CHECK ("template_id" IS NULL OR "template_id" ~ '^(seed|firm):');
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_status_check" CHECK ("status" IN ('todo', 'doing', 'blocked', 'done'));
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_title_check" CHECK (char_length("title") BETWEEN 1 AND 300);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_position_check" CHECK ("position" >= 0);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_estimate_check" CHECK ("estimate_minutes" IS NULL OR "estimate_minutes" BETWEEN 0 AND 10000);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_done_at_check" CHECK (("status" = 'done') = ("done_at" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "engagement_template" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "engagement_template" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "engagement_template_isolation" ON "engagement_template"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "engagement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "engagement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "engagement_isolation" ON "engagement"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "task_isolation" ON "task"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
