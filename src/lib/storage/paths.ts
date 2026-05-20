import path from 'path';
import { env } from '../env';

export const dataDir = () => env.DATA_DIR;

function assertChannelId(channelId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(channelId)) {
    throw new Error(`Invalid channelId: ${channelId}`);
  }
}

function assertVideoId(videoId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
    throw new Error(`Invalid videoId: ${videoId}`);
  }
}

export const paths = {
  db: () => path.resolve(env.DATABASE_PATH),
  logsDir: () => path.join(env.DATA_DIR, 'logs'),

  rawYoutubeSearch: (date: string, slug: string, ts: string) =>
    path.join('raw', 'youtube', 'search', date, `${slug}-${ts}.json`),

  rawYoutubePopular: (categoryId: string, ts: string) =>
    path.join('raw', 'youtube', 'popular', categoryId, `${ts}.json`),

  rawYoutubeChannelMeta: (channelId: string, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'youtube', 'channels', channelId, `meta-${ts}.json`);
  },

  rawYoutubeChannelUploads: (channelId: string, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'youtube', 'channels', channelId, `uploads-${ts}.json`);
  },

  rawYoutubeVideosBatch: (channelId: string, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'youtube', 'videos', channelId, `batch-${ts}.json`);
  },

  rawTranscript: (channelId: string, videoId: string) => {
    assertChannelId(channelId);
    assertVideoId(videoId);
    return path.join('raw', 'transcripts', channelId, `${videoId}.json`);
  },

  rawLlmVideoSelection: (channelId: string, runId: number, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'llm', 'video_selections', channelId, `run-${runId}-${ts}.json`);
  },

  rawLlmQualification: (channelId: string, runId: number, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'llm', 'qualifications', channelId, `run-${runId}-${ts}.json`);
  },

  rawLlmDraft: (channelId: string, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'llm', 'drafts', channelId, `${ts}.json`);
  },

  rawLlmPlaceholder: (channelId: string, ts: string) => {
    assertChannelId(channelId);
    return path.join('raw', 'llm', 'placeholder', channelId, `${ts}.json`);
  },
};

export function tsForFilename(d = new Date()): string {
  return d.toISOString().replace(/:/g, '-');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '');
}

export function absolutePath(relativePath: string): string {
  const base = path.resolve(env.DATA_DIR);
  const abs = path.resolve(base, relativePath);
  if (!abs.startsWith(base + path.sep)) {
    throw new Error(`Path escapes DATA_DIR: ${relativePath}`);
  }
  return abs;
}
