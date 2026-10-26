ALTER TABLE "kb_chunk" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "context" || ' ' || "text")) STORED;
--> statement-breakpoint
CREATE INDEX "kb_chunk_tsv_idx" ON "kb_chunk" USING gin ("tsv");
--> statement-breakpoint
CREATE INDEX "kb_chunk_embedding_idx" ON "kb_chunk" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX "kb_version_one_published" ON "kb_version" ("source_id") WHERE "status" = 'published';
--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_jurisdiction_check" CHECK ("jurisdiction" IN ('AU', 'UK', 'INTL'));
--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_kind_check" CHECK ("kind" IN ('act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum'));
--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_bill_status_check" CHECK ("bill_status" IS NULL OR ("kind" = 'bill' AND "bill_status" IN ('introduced', 'passed', 'assented', 'lapsed')));
--> statement-breakpoint
ALTER TABLE "kb_version" ADD CONSTRAINT "kb_version_status_check" CHECK ("status" IN ('draft', 'published', 'superseded', 'withdrawn'));
--> statement-breakpoint
ALTER TABLE "kb_version" ADD CONSTRAINT "kb_version_input_method_check" CHECK ("input_method" IN ('paste', 'file', 'url', 'copy', 'seed'));
--> statement-breakpoint
-- Versions are withdrawn, never deleted; draft chunks are replaced on re-chunk, so kb_chunk keeps DELETE.
REVOKE DELETE ON "kb_source", "kb_version" FROM chub_app;
