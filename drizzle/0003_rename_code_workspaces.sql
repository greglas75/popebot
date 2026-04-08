ALTER TABLE `claude_workspaces` RENAME TO `code_workspaces`;--> statement-breakpoint
DROP INDEX IF EXISTS `claude_workspaces_container_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `code_workspaces_container_name_unique` ON `code_workspaces` (`container_name`);--> statement-breakpoint
ALTER TABLE `code_workspaces` ADD `coding_agent` text NOT NULL DEFAULT 'claude-code';--> statement-breakpoint
ALTER TABLE `chats` RENAME COLUMN `claude_workspace_id` TO `code_workspace_id`;
