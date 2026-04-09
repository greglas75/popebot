CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`repo` text NOT NULL,
	`title` text,
	`default_branch` text DEFAULT 'main',
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chats` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `code_workspaces` ADD `container_status` text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `code_workspaces` ADD `last_message_at` integer;--> statement-breakpoint
ALTER TABLE `code_workspaces` ADD `container_started_at` integer;