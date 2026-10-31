-- B1. Checks, RLS and the engagement and task FKs (ON DELETE SET NULL of one column, which drizzle cannot express).
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_minutes_check" CHECK ("minutes" IS NULL OR "minutes" BETWEEN 0 AND 1440);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_running_check" CHECK ("minutes" IS NOT NULL OR "started_at" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_note_check" CHECK (char_length("note") <= 500);
--> statement-breakpoint
-- An engagement of another entity or firm is refused; deleting the engagement keeps the entry.
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_engagement_fk" FOREIGN KEY ("engagement_id","client_id","org_id") REFERENCES "public"."engagement"("id","client_id","org_id") ON DELETE SET NULL ("engagement_id");
--> statement-breakpoint
-- (task_id, org_id) only: the task-in-engagement rule is a service check, so deleting an engagement (which cascades its tasks) clears task_id too.
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_fk" FOREIGN KEY ("task_id","org_id") REFERENCES "public"."task"("id","org_id") ON DELETE SET NULL ("task_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "time_entry" TO chub_app;
--> statement-breakpoint
ALTER TABLE "time_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "time_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "time_entry_isolation" ON "time_entry"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
