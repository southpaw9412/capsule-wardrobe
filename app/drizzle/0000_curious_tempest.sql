CREATE TABLE `garments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'Unsorted' NOT NULL,
	`color` text DEFAULT 'Unknown' NOT NULL,
	`season` text DEFAULT 'All seasons' NOT NULL,
	`status` text DEFAULT 'Available' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`image_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_garments_owner_deleted_created` ON `garments` (`owner_id`,`deleted`,`created_at`);