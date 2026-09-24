CREATE TABLE "marketing_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_lookup" text NOT NULL,
	"email_enc" text,
	"source" text NOT NULL,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"consent_guest_id" uuid,
	"unsubscribed_at" timestamp with time zone,
	"unsubscribe_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_contacts_email_lookup_unique" UNIQUE("email_lookup"),
	CONSTRAINT "marketing_contacts_unsubscribe_token_hash_unique" UNIQUE("unsubscribe_token_hash")
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "payload_enc" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "guest_id" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "to_lookup" text;--> statement-breakpoint
CREATE INDEX "email_outbox_guest_idx" ON "email_outbox" USING btree ("guest_id","created_at");--> statement-breakpoint
CREATE INDEX "email_outbox_to_lookup_idx" ON "email_outbox" USING btree ("to_lookup","created_at");