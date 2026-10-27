CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`task_id` text,
	`result_revision` integer,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publications` (
	`source_key` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`source_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`source_version` integer NOT NULL,
	`source_updated_at` text NOT NULL,
	`published_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`snapshot_json` text NOT NULL,
	PRIMARY KEY(`source_key`, `revision`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_request_id` ON `publications` (`request_id`);