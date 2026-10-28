CREATE TABLE "conversation_document" (
	"org_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"attached_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_document_pk" PRIMARY KEY("conversation_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"original_name" text NOT NULL,
	"kind" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"text_chars" integer NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"file_enc" "bytea" NOT NULL,
	"text_enc" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "document_id_client_org_unique" UNIQUE("id","client_id","org_id")
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_id_client_org_unique" UNIQUE("id","client_id","org_id");
--> statement-breakpoint
ALTER TABLE "conversation_document" ADD CONSTRAINT "conversation_document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_document" ADD CONSTRAINT "conversation_document_conversation_fk" FOREIGN KEY ("conversation_id","client_id","org_id") REFERENCES "public"."conversation"("id","client_id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_document" ADD CONSTRAINT "conversation_document_document_fk" FOREIGN KEY ("document_id","client_id","org_id") REFERENCES "public"."document"("id","client_id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_client_org_fk" FOREIGN KEY ("client_id","org_id") REFERENCES "public"."client"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_client_sha_idx" ON "document" USING btree ("client_id","sha256");
