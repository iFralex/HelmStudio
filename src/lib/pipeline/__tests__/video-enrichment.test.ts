import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { QuotaExhausted } from '../../youtube/quota';
import { _resetSettingsCache } from '../../services/settings';
import type { VideoDetail } from '../../youtube/types';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

const { mockGetUploadsPlaylistItems, mockGetVideos } = vi.hoisted(() => ({
  mockGetUploadsPlaylistItems: vi.fn(),
  mockGetVideos: vi.fn(),
}));

vi.mock('../../youtube/operations', () => ({
  getUploadsPlaylistItems: mockGetUploadsPlaylistItems,
  getVideos: mockGetVideos,
}));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    PIPELINE_MIN_SUBSCRIBERS: 80000,
    PIPELINE_MAX_SUBSCRIBERS: 1000000,
    PIPELINE_KEYWORDS_PER_RUN: 30,
    PIPELINE_TARGET_QUALIFIED_PER_RUN: 50,
    PIPELINE_INACTIVE_DAYS: 60,
    PIPELINE_REQUALIFY_AFTER_DAYS: 90,
    DATA_DIR: '/tmp/video-enrichment-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { fetchVideosForSurvivingChannels } from '../discovery/video-enrichment';

function seedRun(db: Db): number {
  const result = db
    .insert(schema.pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: schema.pipelineRuns.id })
    .get()!;
  return result.id;
}

function seedEnrichedChannel(
  db: Db,
  id: string,
  uploadsPlaylistId: string | null = `UU${id.slice(2)}`,
): void {
  db.insert(schema.channels)
    .values({
      id,
      title: `Channel ${id}`,
      discoveryStatus: 'enriched',
      uploadsPlaylistId,
    })
    .run();
}

function makeVideoDetail(id: string, channelId: string, overrides: Partial<VideoDetail> = {}): VideoDetail {
  return {
    id,
    channelId,
    title: `Video ${id}`,
    description: 'Test video',
    publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    duration: 'PT10M30S',
    durationSeconds: 630,
    viewCount: 10000,
    likeCount: 500,
    commentCount: 50,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    tags: ['tag1', 'tag2'],
    categoryId: '22',
    defaultLanguage: 'it',
    defaultAudioLanguage: 'it',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetSettingsCache();
});

describe.runIf(sqlite3Available)('fetchVideosForSurvivingChannels', () => {
  it('returns zeros when no surviving channels exist', async () => {
    const db = makeDb();
    const runId = seedRun(db);

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsWithVideos).toBe(0);
    expect(result.channelsInactive).toBe(0);
    expect(result.videosFetched).toBe(0);
    expect(mockGetUploadsPlaylistItems).not.toHaveBeenCalled();
  });

  it('skips channels without uploadsPlaylistId', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa', null);

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsWithVideos).toBe(0);
    expect(mockGetUploadsPlaylistItems).not.toHaveBeenCalled();
  });

  it('fetches videos and inserts them for surviving channels', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    const videoDetails = [
      makeVideoDetail('vid1', 'UCaaa'),
      makeVideoDetail('vid2', 'UCaaa'),
    ];
    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: ['vid1', 'vid2'], rawPath: 'raw/uploads.json' });
    mockGetVideos.mockResolvedValueOnce({ videos: videoDetails, rawPath: 'raw/videos.json' });

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsWithVideos).toBe(1);
    expect(result.channelsInactive).toBe(0);
    expect(result.videosFetched).toBe(2);

    const rows = db.select().from(schema.videos).all();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.channelId).toBe('UCaaa');
    expect(rows[0]?.rawPath).toBe('raw/videos.json');
  });

  it('marks channel as inactive when playlist is empty', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: [], rawPath: 'raw/uploads.json' });

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsWithVideos).toBe(0);
    expect(result.channelsInactive).toBe(1);
    expect(result.videosFetched).toBe(0);

    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, 'UCaaa')).get();
    expect(channel?.discoveryStatus).toBe('rejected_pre_qual');
    expect(channel?.rejectionReason).toBe('inactive');
  });

  it('marks channel as inactive when video details come back empty', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' });
    mockGetVideos.mockResolvedValueOnce({ videos: [], rawPath: null });

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsInactive).toBe(1);
    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, 'UCaaa')).get();
    expect(channel?.discoveryStatus).toBe('rejected_pre_qual');
    expect(channel?.rejectionReason).toBe('inactive');
  });

  it('marks channel as inactive when most recent video is older than inactiveDays', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago (> 60 day limit)
    const videoDetails = [makeVideoDetail('vid1', 'UCaaa', { publishedAt: oldDate })];

    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' });
    mockGetVideos.mockResolvedValueOnce({ videos: videoDetails, rawPath: 'raw/videos.json' });

    const result = await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    expect(result.channelsInactive).toBe(1);
    const channel = db.select().from(schema.channels).where(eq(schema.channels.id, 'UCaaa')).get();
    expect(channel?.discoveryStatus).toBe('rejected_pre_qual');
    expect(channel?.rejectionReason).toBe('inactive');
  });

  it('logs pipelineEvents for inactive channels', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: [], rawPath: 'raw/uploads.json' });

    await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    const events = db.select().from(schema.pipelineEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('channel_pre_rejected');
    expect(events[0]?.stage).toBe('filter');
    expect(events[0]?.channelId).toBe('UCaaa');
  });

  it('updates pipelineRuns counters correctly', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCactive');
    seedEnrichedChannel(db, 'UCinactive');

    mockGetUploadsPlaylistItems
      .mockResolvedValueOnce({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' })
      .mockResolvedValueOnce({ videoIds: [], rawPath: 'raw/uploads2.json' });
    mockGetVideos.mockResolvedValueOnce({
      videos: [makeVideoDetail('vid1', 'UCactive')],
      rawPath: 'raw/videos.json',
    });

    await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    const run = db.select().from(schema.pipelineRuns).get()!;
    expect(run.channelsEnriched).toBe(1);
    expect(run.channelsPreRejected).toBe(1);
  });

  it('inserts video rows idempotently (no duplicate on re-run)', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    const videoDetails = [makeVideoDetail('vid1', 'UCaaa')];
    mockGetUploadsPlaylistItems.mockResolvedValue({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' });
    mockGetVideos.mockResolvedValue({ videos: videoDetails, rawPath: 'raw/videos.json' });

    await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);
    await fetchVideosForSurvivingChannels({ runId, limit: 50 }, db);

    const rows = db.select().from(schema.videos).all();
    expect(rows).toHaveLength(1);
  });

  it('stops gracefully on QuotaExhausted during playlist fetch and writes partial state to DB', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');
    seedEnrichedChannel(db, 'UCbbb');

    mockGetUploadsPlaylistItems
      .mockResolvedValueOnce({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' })
      .mockRejectedValueOnce(new QuotaExhausted(9500, 9500));
    mockGetVideos.mockResolvedValueOnce({
      videos: [makeVideoDetail('vid1', 'UCaaa')],
      rawPath: 'raw/videos.json',
    });

    await expect(fetchVideosForSurvivingChannels({ runId, limit: 50 }, db)).rejects.toBeInstanceOf(QuotaExhausted);

    const videoRows = db.select().from(schema.videos).all();
    expect(videoRows).toHaveLength(1);
    expect(videoRows[0]?.channelId).toBe('UCaaa');
  });

  it('stops gracefully on QuotaExhausted during video fetch and writes no videos to DB', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    seedEnrichedChannel(db, 'UCaaa');

    mockGetUploadsPlaylistItems.mockResolvedValueOnce({ videoIds: ['vid1'], rawPath: 'raw/uploads.json' });
    mockGetVideos.mockRejectedValueOnce(new QuotaExhausted(9500, 9500));

    await expect(fetchVideosForSurvivingChannels({ runId, limit: 50 }, db)).rejects.toBeInstanceOf(QuotaExhausted);

    const videoRows = db.select().from(schema.videos).all();
    expect(videoRows).toHaveLength(0);
  });

  it('respects the limit parameter', async () => {
    const db = makeDb();
    const runId = seedRun(db);
    for (let i = 0; i < 5; i++) {
      seedEnrichedChannel(db, `UC${String(i).padStart(5, '0')}`);
    }

    mockGetUploadsPlaylistItems.mockResolvedValue({ videoIds: [], rawPath: 'raw/uploads.json' });

    await fetchVideosForSurvivingChannels({ runId, limit: 3 }, db);

    expect(mockGetUploadsPlaylistItems).toHaveBeenCalledTimes(3);
  });
});
