-- chub_app may read and write rows; it owns nothing, so FORCE'd RLS applies to it.
GRANT USAGE ON SCHEMA public TO chub_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chub_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE chub IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE chub IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chub_app;
