CREATE TYPE "public"."attempt_status" AS ENUM('running', 'succeeded', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_status" AS ENUM('none', 'queued', 'generating', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('open', 'paid', 'expired', 'refund_pending', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('service_failure', 'goodwill', 'duplicate', 'admin');--> statement-breakpoint
CREATE TYPE "public"."refund_source" AS ENUM('service', 'provider');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'pending', 'requires_action', 'succeeded', 'failed', 'canceled', 'unknown');--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_customer_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chart_group_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"input_enc" text,
	"response_enc" text,
	"policy_version" text NOT NULL,
	"coverage_version" text NOT NULL,
	"tzdata_version" text NOT NULL,
	"library_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"pii_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_lookup" text NOT NULL,
	"email_enc" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_lookup_unique" UNIQUE("email_lookup")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"stripe_dispute_id" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"evidence_due_by" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_stripe_dispute_id_unique" UNIQUE("stripe_dispute_id")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"to_email_enc" text,
	"order_id" uuid,
	"dedupe_key" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pii_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"fencing_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "attempt_status" DEFAULT 'running' NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cookie_hash" text NOT NULL,
	"first_utm" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_cookie_hash_unique" UNIQUE("cookie_hash")
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chart_revision_id" uuid,
	"guest_id" uuid NOT NULL,
	"customer_id" uuid,
	"sku" text NOT NULL,
	"unit_amount_cents" integer NOT NULL,
	"subtotal_cents" integer,
	"tax_cents" integer,
	"total_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"snapshot_enc" text,
	"delivery_email_enc" text,
	"delivery_email_lookup" text,
	"consent_version" text NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"payment_status" "payment_status" DEFAULT 'open' NOT NULL,
	"fulfillment_status" "fulfillment_status" DEFAULT 'none' NOT NULL,
	"current_fencing_token" uuid,
	"paid_at" timestamp with time zone,
	"fulfillment_deadline_at" timestamp with time zone,
	"utm" jsonb,
	"pii_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "orders_amount_positive" CHECK ("orders"."unit_amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"order_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"content_enc" text,
	"used_snippet_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"model_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pii_deleted_at" timestamp with time zone,
	CONSTRAINT "readings_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"source" "refund_source" DEFAULT 'service' NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"stripe_refund_id" text,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_stripe_refund_id_unique" UNIQUE("stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"rotated_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_customer_id_customers_id_fk" FOREIGN KEY ("actor_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_revisions" ADD CONSTRAINT "chart_revisions_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_chart_revision_id_chart_revisions_id_fk" FOREIGN KEY ("chart_revision_id") REFERENCES "public"."chart_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_revisions_guest_idx" ON "chart_revisions" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "chart_revisions_delete_after_idx" ON "chart_revisions" USING btree ("delete_after");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_order_no_uq" ON "generation_attempts" USING btree ("order_id","attempt_no");--> statement-breakpoint
CREATE INDEX "magic_links_customer_idx" ON "magic_links" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_active_per_revision" ON "orders" USING btree ("guest_id","chart_revision_id","sku") WHERE "orders"."payment_status" in ('open', 'paid', 'refund_pending', 'partially_refunded');--> statement-breakpoint
CREATE INDEX "orders_delivery_email_lookup_idx" ON "orders" USING btree ("delivery_email_lookup");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_payment_intent_idx" ON "orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "orders_status_paid_at_idx" ON "orders" USING btree ("payment_status","paid_at");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_deadline_idx" ON "orders" USING btree ("fulfillment_status","fulfillment_deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uq" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_one_claim_per_order" ON "refunds" USING btree ("order_id") WHERE "refunds"."source" = 'service' and "refunds"."status" in ('requested', 'pending', 'requires_action', 'unknown', 'succeeded');--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sessions_customer_idx" ON "sessions" USING btree ("customer_id");