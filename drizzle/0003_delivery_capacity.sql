CREATE TABLE "attempt_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"actor_customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_grants_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "email_budget" (
	"day" text PRIMARY KEY NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "tokens_cache_read" integer;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "tokens_cache_write" integer;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "cost_micro_usd" integer;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "pricing_version" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_promise" text DEFAULT 'minutes' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;