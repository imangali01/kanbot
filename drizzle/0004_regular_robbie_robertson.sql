CREATE TABLE "chat_media" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"media_group_id" text NOT NULL,
	"kind" text NOT NULL,
	"file_id" text NOT NULL,
	"file_unique_id" text NOT NULL,
	"name" text,
	"mime" text,
	"size" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_media_group_file_uq" UNIQUE("chat_id","media_group_id","file_unique_id")
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "bot_is_admin" boolean;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "media_group_id" text;--> statement-breakpoint
ALTER TABLE "chat_media" ADD CONSTRAINT "chat_media_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "chat_media_created_idx" ON "chat_media" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_media_group_idx" ON "tasks" USING btree ("chat_id","media_group_id");