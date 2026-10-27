-- Facts (P2b). Checks mirror factSchema in src/data/schemas.ts.
ALTER TABLE "kb_fact" ADD CONSTRAINT "kb_fact_key_check" CHECK ("key" ~ '^(au|uk|intl)\.[a-zA-Z0-9.]+$');
--> statement-breakpoint
ALTER TABLE "kb_fact" ADD CONSTRAINT "kb_fact_jurisdiction_check" CHECK ("jurisdiction" IN ('AU', 'UK', 'INTL'));
--> statement-breakpoint
ALTER TABLE "kb_fact" ADD CONSTRAINT "kb_fact_unit_check" CHECK ("unit" IN ('bp', 'cents', 'count', 'date', 'text'));
--> statement-breakpoint
ALTER TABLE "kb_fact" ADD CONSTRAINT "kb_fact_value_check" CHECK (
  ("unit" IN ('bp', 'cents', 'count') AND "value_num" IS NOT NULL AND "value_text" IS NULL)
  OR ("unit" IN ('date', 'text') AND "value_text" IS NOT NULL AND "value_num" IS NULL)
);
--> statement-breakpoint
-- Facts are corrected, never deleted; history is append-only.
REVOKE DELETE ON "kb_fact" FROM chub_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "kb_fact_history" FROM chub_app;
