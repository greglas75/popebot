CREATE TABLE `claude_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`container_name` text NOT NULL,
	`title` text DEFAULT 'Claude Workspace' NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claude_workspaces_container_name_unique` ON `claude_workspaces` (`container_name`);