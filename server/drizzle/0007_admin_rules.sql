-- One platform admin for now (see plans/p2a and CLAUDE.md). Drop this index to allow more.
CREATE UNIQUE INDEX "user_one_platform_admin" ON "user" ("role") WHERE "role" = 'platform_admin';
--> statement-breakpoint
-- The audit log is append-only for the app role.
REVOKE UPDATE, DELETE ON "admin_audit" FROM chub_app;
