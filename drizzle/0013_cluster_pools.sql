CREATE TABLE `cluster_roles_new` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_id` text NOT NULL,
	`role_name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`trigger_config` text,
	`max_concurrency` integer DEFAULT 1 NOT NULL,
	`cleanup_worker_dir` integer DEFAULT 0 NOT NULL,
	`folders` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `cluster_roles_new` (`id`, `cluster_id`, `role_name`, `role`, `created_at`, `updated_at`)
SELECT `cr`.`id`, COALESCE(`cw`.`cluster_id`, (SELECT `id` FROM `clusters` LIMIT 1)), `cr`.`role_name`, `cr`.`role`, `cr`.`created_at`, `cr`.`updated_at`
FROM `cluster_roles` `cr`
LEFT JOIN `cluster_workers` `cw` ON `cw`.`cluster_role_id` = `cr`.`id`;
--> statement-breakpoint
DROP TABLE `cluster_roles`;
--> statement-breakpoint
ALTER TABLE `cluster_roles_new` RENAME TO `cluster_roles`;
--> statement-breakpoint
DROP TABLE `cluster_workers`;
