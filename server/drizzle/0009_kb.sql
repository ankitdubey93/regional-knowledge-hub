CREATE TABLE "kb_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"provision_ref" text,
	"context" text NOT NULL,
	"text" text NOT NULL,
	"tokens" integer NOT NULL,
	"embedding" vector(768),
	"embed_model" text,
	"embedded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kb_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"citation" text NOT NULL,
	"official_url" text,
	"publisher" text DEFAULT '' NOT NULL,
	"bill_status" text,
	"enacted_as_source_id" uuid,
	"site_path" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"retrieved_on" date NOT NULL,
	"input_method" text NOT NULL,
	"original_name" text,
	"body_md" text NOT NULL,
	"sha256" text NOT NULL,
	"change_note" text DEFAULT '' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text
);
--> statement-breakpoint
ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_version_id_kb_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."kb_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_enacted_as_source_id_kb_source_id_fk" FOREIGN KEY ("enacted_as_source_id") REFERENCES "public"."kb_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_version" ADD CONSTRAINT "kb_version_source_id_kb_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."kb_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kb_chunk_version_ordinal_idx" ON "kb_chunk" USING btree ("version_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_source_site_path_idx" ON "kb_source" USING btree ("site_path");--> statement-breakpoint
CREATE INDEX "kb_version_source_idx" ON "kb_version" USING btree ("source_id");