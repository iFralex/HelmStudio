DROP INDEX `idx_transcripts_video`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_transcripts_video_id` ON `transcripts` (`video_id`);