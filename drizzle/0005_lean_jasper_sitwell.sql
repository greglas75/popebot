CREATE TABLE `cluster_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cluster_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_id` text NOT NULL,
	`cluster_role_id` text,
	`replica_index` integer NOT NULL,
	`code_workspace_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'New Cluster' NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
