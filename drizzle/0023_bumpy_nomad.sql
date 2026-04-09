CREATE INDEX `projects_user_id_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_repo_idx` ON `projects` (`user_id`,`repo`);