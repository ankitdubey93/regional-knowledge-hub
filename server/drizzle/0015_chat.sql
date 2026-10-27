CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint NOT NULL,
	"estimated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_citation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"marker" integer NOT NULL,
	"source_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"title" text NOT NULL,
	"citation" text NOT NULL,
	"kind" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"bill_status" text,
	"heading_path" text[] DEFAULT '{}'::text[] NOT NULL,
	"provision_ref" text,
	"site_path" text,
	"official_url" text,
	"excerpt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_citation" ADD CONSTRAINT "chat_citation_message_org_fk" FOREIGN KEY ("message_id","org_id") REFERENCES "public"."chat_message"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_org_fk" FOREIGN KEY ("conversation_id","org_id") REFERENCES "public"."conversation"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_citation_message_marker_idx" ON "chat_citation" USING btree ("message_id","marker");--> statement-breakpoint
CREATE INDEX "chat_message_conversation_idx" ON "chat_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_org_client_idx" ON "conversation" USING btree ("org_id","client_id","updated_at");