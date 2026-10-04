CREATE TABLE `project_info` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`singleton` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "project_info_singleton" CHECK("project_info"."singleton" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_info_one_row` ON `project_info` (`singleton`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`github_url` text NOT NULL,
	`slug` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project_info`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_url_unique` ON `repositories` (`github_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_project_slug_unique` ON `repositories` (`project_id`,`slug`);