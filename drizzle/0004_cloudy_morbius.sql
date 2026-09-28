ALTER TABLE "memories" DROP CONSTRAINT "memories_source_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "connections" DROP COLUMN "auth_kind";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN "source_message_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "tool_calls";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";--> statement-breakpoint
DROP TYPE "public"."connection_auth_kind";