CREATE TABLE "funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"visitor_id" text NOT NULL,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chart_revisions" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "visitor_id" text;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "funnel_events_name_created_idx" ON "funnel_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_events_once_per_day" ON "funnel_events" USING btree ("visitor_id","name",((created_at at time zone 'UTC')::date));