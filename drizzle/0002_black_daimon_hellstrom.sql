PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_claude_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`container_name` text,
	`repo` text,
	`branch` text,
	`title` text DEFAULT 'Claude Workspace' NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_claude_workspaces`("id", "user_id", "container_name", "repo", "branch", "title", "starred", "created_at", "updated_at") SELECT "id", "user_id", "container_name", NULL, NULL, "title", "starred", "created_at", "updated_at" FROM `claude_workspaces`;--> statement-breakpoint
DROP TABLE `claude_workspaces`;--> statement-breakpoint
ALTER TABLE `__new_claude_workspaces` RENAME TO `claude_workspaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `claude_workspaces_container_name_unique` ON `claude_workspaces` (`container_name`);--> statement-breakpoint
ALTER TABLE `chats` ADD `claude_workspace_id` text;