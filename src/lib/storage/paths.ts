import path from 'path';
import { env } from '../env';

export const dataDir = () => env.DATA_DIR;

export const paths = {
  db: () => path.join(env.DATA_DIR, 'pipeline.db'),
  logsDir: () => path.join(env.DATA_DIR, 'logs'),

  rawYoutubeSearch: (date: string, slug: string, ts: string) =>
    path.join('raw', 'youtube', 'search', date, `${slug}-${ts}.json`),

  rawYoutubeChannelMeta: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'channels', channelId, `meta-${ts}.json`),

  rawYoutubeChannelUploads: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'channels', channelId, `uploads-${ts}.json`),

  rawYoutubeVideosBatch: (channelId: string, ts: string) =>
    path.join('raw', 'youtube', 'videos', channelId, `batch-${ts}.json`),

  rawTranscript: (channelId: string, videoId: string) =>
    path.join('raw', 'transcripts', channelId, `${videoId}.json`),

  rawLlmVideoSelection: (channelId: string, runId: number, ts: string) =>
    path.join('raw', 'llm', 'video_selections', channelId, `run-${runId}-${ts}.json`),

  rawLlmQualification: (channelId: string, runId: number, ts: string) =>
    path.join('raw', 'llm', 'qualifications', channelId, `run-${runId}-${ts}.json`),

  rawLlmDraft: (channelId: string, ts: string) =>
    path.join('raw', 'llm', 'drafts', channelId, `${ts}.json`),
};

export function tsForFilename(d = new Date()): string {
  return d.toISOString().replace(/:/g, '-');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function absolutePath(relativePath: string): string {
  return path.join(env.DATA_DIR, relativePath);
}
