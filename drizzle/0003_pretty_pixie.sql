CREATE TABLE "task_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"file_id" text NOT NULL,
	"file_unique_id" text NOT NULL,
	"name" text,
	"mime" text,
	"size" bigint
);
--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_attachments_task_idx" ON "task_attachments" USING btree ("task_id");