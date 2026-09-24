CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tried_at" timestamp with time zone,
	CONSTRAINT "checkout_attempts_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "checkout_attempts_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
DROP INDEX "orders_one_active_per_revision";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promotion_code_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "duplicate_of_order_id" uuid;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "library_version" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_active_per_revision" ON "orders" USING btree ("guest_id","chart_revision_id","sku") WHERE "orders"."payment_status" in ('open', 'paid', 'refund_pending', 'partially_refunded') and "orders"."duplicate_of_order_id" is null and ("orders"."payment_status" = 'open' or "orders"."fulfillment_status" <> 'none');