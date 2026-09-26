-- CC4c: provider-neutral payment columns (Stripe and PayPal). Pure renames + one new column with a default:
-- no data changes, existing rows are Stripe orders.
ALTER TABLE "orders" RENAME COLUMN "stripe_session_id" TO "provider_checkout_id";--> statement-breakpoint
ALTER TABLE "orders" RENAME CONSTRAINT "orders_stripe_session_id_unique" TO "orders_provider_checkout_id_unique";--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "stripe_payment_intent_id" TO "provider_payment_id";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" RENAME COLUMN "stripe_refund_id" TO "provider_refund_id";--> statement-breakpoint
ALTER TABLE "refunds" RENAME CONSTRAINT "refunds_stripe_refund_id_unique" TO "refunds_provider_refund_id_unique";--> statement-breakpoint
ALTER TABLE "disputes" RENAME COLUMN "stripe_dispute_id" TO "provider_dispute_id";--> statement-breakpoint
ALTER TABLE "disputes" RENAME CONSTRAINT "disputes_stripe_dispute_id_unique" TO "disputes_provider_dispute_id_unique";
