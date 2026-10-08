CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_id` integer NOT NULL,
	`round` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_round_table` ON `attendance` (`round`,`table_id`);--> statement-breakpoint
CREATE TABLE `event_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_round` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`round_started_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '익명' NOT NULL,
	`message` text NOT NULL,
	`winner` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_created_at` ON `feedback` (`created_at`);--> statement-breakpoint
CREATE TABLE `material_links` (
	`table_id` integer PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
