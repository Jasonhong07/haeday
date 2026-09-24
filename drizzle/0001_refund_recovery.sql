CREATE TYPE "public"."issue_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
ALTER TYPE "public"."refund_reason" ADD VALUE 'validation_failure';--> statement-breakpoint
CREATE TABLE "payment_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"order_id" uuid,
	"provider_object_id" text,
	"livemode" boolean NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"next_action" text NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "payment_issues_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "refund_syncs" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"dirty" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "attempt_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "first_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_issues" ADD CONSTRAINT "payment_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_syncs" ADD CONSTRAINT "refund_syncs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_issues_status_idx" ON "payment_issues" USING btree ("status","created_at");--> statement-breakpoint
-- Claims that may already have reached the provider before first_sent_at existed: measure the idempotency window
-- from their creation, so they are looked up (never blindly re-sent) once it has passed.
UPDATE "refunds" SET "first_sent_at" = "created_at" WHERE "status" IN ('requested', 'unknown') AND "first_sent_at" IS NULL;