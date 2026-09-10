CREATE TABLE `outfit_items` (
	`outfit_id` text NOT NULL,
	`garment_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`outfit_id`, `garment_id`),
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outfit_wears` (
	`outfit_id` text NOT NULL,
	`worn_on` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`outfit_id`, `worn_on`),
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`season` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outfits_owner_created` ON `outfits` (`owner_id`,`created_at`);