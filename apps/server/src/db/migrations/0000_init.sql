CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"join_code" char(6) NOT NULL,
	"secret_hash" text NOT NULL,
	"title" text,
	"settings" jsonb NOT NULL,
	"active_item_id" uuid,
	"active_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"deck_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"nickname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_deck_id_id_pk" PRIMARY KEY("deck_id","id")
);
--> statement-breakpoint
CREATE TABLE "qa_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"text" text NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"answered" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_votes" (
	"qa_item_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	CONSTRAINT "qa_votes_qa_item_id_participant_id_pk" PRIMARY KEY("qa_item_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_response_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"points" integer,
	"response_ms" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_client_response_id_unique" UNIQUE("client_response_id")
);
--> statement-breakpoint
CREATE TABLE "slide_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"type" text,
	"config" jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"phase_ends_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_items" ADD CONSTRAINT "qa_items_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_votes" ADD CONSTRAINT "qa_votes_qa_item_id_qa_items_id_fk" FOREIGN KEY ("qa_item_id") REFERENCES "public"."qa_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_id_slide_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."slide_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slide_items" ADD CONSTRAINT "slide_items_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_last_activity_idx" ON "decks" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "qa_items_deck_idx" ON "qa_items" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "responses_item_idx" ON "responses" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "slide_items_deck_idx" ON "slide_items" USING btree ("deck_id");