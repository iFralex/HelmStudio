CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text,
	`title` text NOT NULL,
	`description` text,
	`country` text,
	`default_language` text,
	`custom_url` text,
	`subscriber_count` integer,
	`view_count` integer,
	`video_count` integer,
	`uploads_playlist_id` text,
	`thumbnail_url` text,
	`channel_published_at` text,
	`discovery_status` text DEFAULT 'candidate' NOT NULL,
	`rejection_reason` text,
	`discovery_source` text,
	`outreach_status` text DEFAULT 'none' NOT NULL,
	`email` text,
	`email_added_at` integer,
	`outreach_sent_at` integer,
	`outreach_notes` text,
	`latest_qualification_id` integer,
	`latest_automation_score` integer,
	`raw_meta_path` text,
	`discovered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_fetched_at` integer,
	`last_qualified_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_channels_discovery_status` ON `channels` (`discovery_status`);--> statement-breakpoint
CREATE INDEX `idx_channels_outreach_status` ON `channels` (`outreach_status`);--> statement-breakpoint
CREATE INDEX `idx_channels_score` ON `channels` (`latest_automation_score`);--> statement-breakpoint
CREATE INDEX `idx_channels_country` ON `channels` (`country`);--> statement-breakpoint
CREATE TABLE `outreach_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`qualification_id` integer,
	`language` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`model_used` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`raw_response_path` text NOT NULL,
	`is_current` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`qualification_id`) REFERENCES `qualifications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_draft_channel` ON `outreach_drafts` (`channel_id`);--> statement-breakpoint
CREATE TABLE `pipeline_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer,
	`channel_id` text,
	`stage` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`event` text NOT NULL,
	`message` text,
	`details` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_events_run` ON `pipeline_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_events_channel` ON `pipeline_events` (`channel_id`);--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`triggered_by` text NOT NULL,
	`searches_performed` integer DEFAULT 0 NOT NULL,
	`candidates_found` integer DEFAULT 0 NOT NULL,
	`channels_enriched` integer DEFAULT 0 NOT NULL,
	`channels_pre_rejected` integer DEFAULT 0 NOT NULL,
	`channels_qualified` integer DEFAULT 0 NOT NULL,
	`channels_post_rejected` integer DEFAULT 0 NOT NULL,
	`youtube_quota_used` integer DEFAULT 0 NOT NULL,
	`llm_calls_count` integer DEFAULT 0 NOT NULL,
	`llm_tokens_input` integer DEFAULT 0 NOT NULL,
	`llm_tokens_output` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`error_stack` text
);
--> statement-breakpoint
CREATE TABLE `qualifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`run_id` integer,
	`video_selection_id` integer,
	`model_used` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`niche_classification` text,
	`format_type` text,
	`automation_potential_score` integer,
	`automatable_workflows` text,
	`suggested_solution` text,
	`pitch_angle` text,
	`pitch_language` text,
	`signals` text,
	`disqualifiers` text,
	`confidence` real,
	`rationale` text,
	`raw_response_path` text NOT NULL,
	`raw_prompt_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_selection_id`) REFERENCES `video_selections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_qual_channel` ON `qualifications` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_qual_score` ON `qualifications` (`automation_potential_score`);--> statement-breakpoint
CREATE TABLE `quota_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`operation` text NOT NULL,
	`units` integer NOT NULL,
	`run_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quota_date` ON `quota_ledger` (`date`);--> statement-breakpoint
CREATE TABLE `seed_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_used_at` integer,
	`total_uses` integer DEFAULT 0 NOT NULL,
	`total_candidates_produced` integer DEFAULT 0 NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seed_keywords_keyword_unique` ON `seed_keywords` (`keyword`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`video_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`language` text,
	`source` text NOT NULL,
	`text` text,
	`segments` text,
	`character_count` integer,
	`fetch_succeeded` integer DEFAULT true NOT NULL,
	`fetch_error` text,
	`raw_path` text,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transcripts_video` ON `transcripts` (`video_id`);--> statement-breakpoint
CREATE INDEX `idx_transcripts_channel` ON `transcripts` (`channel_id`);--> statement-breakpoint
CREATE TABLE `video_selections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`run_id` integer,
	`video_classifications` text NOT NULL,
	`selected_video_ids` text NOT NULL,
	`format_consistency_summary` text,
	`selection_rationale` text,
	`model_used` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`raw_response_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `pipeline_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vselect_channel` ON `video_selections` (`channel_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`published_at` integer NOT NULL,
	`duration` text,
	`duration_seconds` integer,
	`view_count` integer,
	`like_count` integer,
	`comment_count` integer,
	`thumbnail_url` text,
	`tags` text,
	`category_id` text,
	`default_language` text,
	`default_audio_language` text,
	`raw_path` text,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_videos_channel` ON `videos` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_videos_published` ON `videos` (`published_at`);