-- Hand-edited: composite FKs null only the reference column (PostgreSQL 15+),
-- never user_id. Drizzle cannot express SET NULL (column).
CREATE TYPE "public"."offer_state" AS ENUM('new', 'added', 'dismissed');--> statement-breakpoint
CREATE TABLE "job_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"saved_search_id" uuid,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"location" text,
	"url" text,
	"contract_types" text,
	"work_mode" "work_mode",
	"description" text,
	"published_at" timestamp with time zone,
	"state" "offer_state" DEFAULT 'new' NOT NULL,
	"application_id" uuid,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_offer_user_id_uq" UNIQUE("user_id","id"),
	CONSTRAINT "job_offer_dedupe_uq" UNIQUE("user_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "saved_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"rome_codes" text[] NOT NULL,
	"departements" text[] NOT NULL,
	"diploma_level" integer NOT NULL,
	"notify_telegram" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_search_user_id_uq" UNIQUE("user_id","id"),
	CONSTRAINT "saved_search_level_ck" CHECK ("saved_search"."diploma_level" BETWEEN 3 AND 7),
	CONSTRAINT "saved_search_romes_ck" CHECK (cardinality("saved_search"."rome_codes") BETWEEN 1 AND 10),
	CONSTRAINT "saved_search_deps_ck" CHECK (cardinality("saved_search"."departements") BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "sent_notification" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sent_notification_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "telegram_link" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"username" text,
	"pending_url" text,
	"pending_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_link_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_link_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_offer" ADD CONSTRAINT "job_offer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offer" ADD CONSTRAINT "job_offer_search_owner_fk" FOREIGN KEY ("user_id","saved_search_id") REFERENCES "public"."saved_search"("user_id","id") ON DELETE SET NULL ("saved_search_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_offer" ADD CONSTRAINT "job_offer_application_owner_fk" FOREIGN KEY ("user_id","application_id") REFERENCES "public"."application"("user_id","id") ON DELETE SET NULL ("application_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_notification" ADD CONSTRAINT "sent_notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link" ADD CONSTRAINT "telegram_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_token" ADD CONSTRAINT "telegram_link_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_offer_user_state_idx" ON "job_offer" USING btree ("user_id","state","created_at");--> statement-breakpoint
CREATE INDEX "saved_search_user_idx" ON "saved_search" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_link_token_user_idx" ON "telegram_link_token" USING btree ("user_id");