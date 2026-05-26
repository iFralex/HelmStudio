CREATE TABLE `outreach_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`channel_ids` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_batches_token_unique` ON `outreach_batches` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outreach_batches_token` ON `outreach_batches` (`token`);