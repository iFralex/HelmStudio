import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { _resetSettingsCache } from '../../services/settings';
import type { ChannelDetail, VideoDetail } from '../../youtube/types';

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

const {
  mockSearchChannels,
  mockGetMostPopularByCategory,
  mockGetChannels,
  mockGetUploadsPlaylistItems,
  mockGetVideos,
} = vi.hoisted(() => ({
  mockSearchChannels: vi.fn(),
  mockGetMostPopularByCategory: vi.fn(),
  mockGetChannels: vi.fn(),
  mockGetUploadsPlaylistItems: vi.fn(),
  mockGetVideos: vi.fn(),
}));

vi.mock('../../youtube/operations', () => ({
  searchChannels: mockSearchChannels,
  getMostPopularByCategory: mockGetMostPopularByCategory,
  getChannels: mockGetChannels,
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
    PIPELINE_KEYWORDS_PER_RUN: 3,
    PIPELINE_TARGET_QUALIFIED_PER_RUN: 50,
    PIPELINE_INACTIVE_DAYS: 60,
    PIPELINE_REQUALIFY_AFTER_DAYS: 90,
    DATA_DIR: '/tmp/discovery-integration-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runDiscovery } from '../discovery/run';

// UC01–UC04 survive the subscriber filter (200k subs > 80k min)
// UC05–UC08 are rejected by the filter (50k subs < 80k min)
// After filter, UC01 and UC02 get recent videos; UC03 gets old videos (inactive); UC04 gets empty playlist (inactive)
const HIGH_SUB_IDS = ['UC01', 'UC02', 'UC03', 'UC04'];
const LOW_SUB_IDS = ['UC05', 'UC06', 'UC07', 'UC08'];
const ALL_CHANNEL_IDS = [...HIGH_SUB_IDS, ...LOW_SUB_IDS];

function makeUploadsId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

function makeChannelDetail(id: string, subscriberCount: number, overrides: Partial<ChannelDetail> = {}): ChannelDetail {
  return {
    id,
    handle: `@handle-${id}`,
    title: `Channel ${id}`,
    description: 'Test channel',
    country: 'IT',
    defaultLanguage: 'it',
    customUrl: `@handle-${id}`,
    subscriberCount,
    viewCount: 5_000_000,
    videoCount: 50,
    uploadsPlaylistId: makeUploadsId(id),
    thumbnailUrl: 'https://example.com/thumb.jpg',
    channelPublishedAt: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeVideoDetail(id: string, channelId: string, overrides: Partial<VideoDetail> = {}): VideoDetail {
  return {
    id,
    channelId,
    title: `Video ${id}`,
    description: 'Test video',
    publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 'PT10M30S',
    durationSeconds: 630,
    viewCount: 10_000,
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

function seedRun(db: Db): number {
  return db
    .insert(schema.pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: schema.pipelineRuns.id })
    .get()!.id;
}

function seedKeyword(db: Db, keyword: string): void {
  db.insert(schema.seedKeywords).values({ keyword, isActive: true }).run();
}

function setupAllMocks(): void {
  // Keyword sweep: 3 keywords → 6 unique channels (UC01–UC06)
  // keyword 1: 3 new; keyword 2: 2 new + 1 overlap; keyword 3: 1 new + 2 overlaps
  mockSearchChannels
    .mockResolvedValueOnce({ channelIds: ['UC01', 'UC02', 'UC03'], rawPath: 'raw/search/1.json' })
    .mockResolvedValueOnce({ channelIds: ['UC04', 'UC05', 'UC03'], rawPath: 'raw/search/2.json' })
    .mockResolvedValueOnce({ channelIds: ['UC06', 'UC01', 'UC05'], rawPath: 'raw/search/3.json' });

  // Category exploration: first 2 categories add UC07 and UC08; rest produce no new channels
  // IN_SCOPE_CATEGORY_IDS has 11 entries; categories '2' and '17' are first two
  mockGetMostPopularByCategory
    .mockResolvedValueOnce({ channelIds: ['UC07', 'UC02'], rawPath: 'raw/popular/2.json' })   // UC07 new, UC02 overlap
    .mockResolvedValueOnce({ channelIds: ['UC08', 'UC04'], rawPath: 'raw/popular/17.json' })  // UC08 new, UC04 overlap
    .mockResolvedValue({ channelIds: [], rawPath: 'raw/popular/empty.json' });

  // Enrichment: one batch of 8 channels
  const allDetails = [
    ...HIGH_SUB_IDS.map((id) => makeChannelDetail(id, 200_000)),
    ...LOW_SUB_IDS.map((id) => makeChannelDetail(id, 50_000)),
  ];
  const rawPaths: Record<string, string> = Object.fromEntries(
    ALL_CHANNEL_IDS.map((id) => [id, `raw/youtube/channels/${id}/meta.json`]),
  );
  mockGetChannels.mockResolvedValueOnce({ channels: allDetails, rawPaths });

  // Video enrichment: UC01+UC02 active, UC03 inactive (old video), UC04 inactive (empty playlist)
  const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  mockGetUploadsPlaylistItems.mockImplementation(async ({ playlistId }: { playlistId: string }) => {
    if (playlistId === 'UU01') return { videoIds: ['vid01a', 'vid01b'], rawPath: 'raw/playlist/01.json' };
    if (playlistId === 'UU02') return { videoIds: ['vid02a', 'vid02b'], rawPath: 'raw/playlist/02.json' };
    if (playlistId === 'UU03') return { videoIds: ['vid03a'], rawPath: 'raw/playlist/03.json' };
    if (playlistId === 'UU04') return { videoIds: [], rawPath: 'raw/playlist/04.json' };
    return { videoIds: [], rawPath: 'raw/playlist/empty.json' };
  });

  mockGetVideos.mockImplementation(async ({ channelIdForStorage }: { ids: string[]; channelIdForStorage: string }) => {
    if (channelIdForStorage === 'UC01') {
      return {
        videos: [makeVideoDetail('vid01a', 'UC01'), makeVideoDetail('vid01b', 'UC01')],
        rawPath: 'raw/videos/01.json',
      };
    }
    if (channelIdForStorage === 'UC02') {
      return {
        videos: [makeVideoDetail('vid02a', 'UC02'), makeVideoDetail('vid02b', 'UC02')],
        rawPath: 'raw/videos/02.json',
      };
    }
    if (channelIdForStorage === 'UC03') {
      return {
        videos: [makeVideoDetail('vid03a', 'UC03', { publishedAt: oldDate })],
        rawPath: 'raw/videos/03.json',
      };
    }
    return { videos: [], rawPath: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetSettingsCache();
});

describe.runIf(sqlite3Available)('runDiscovery integration', () => {
  it('runs the full pipeline: 3 keywords + 2 categories → 8 channels, 4 rejected by filter, 2 with videos', async () => {
    const db = makeDb();
    const runId = seedRun(db);

    seedKeyword(db, 'cucina italiana');
    seedKeyword(db, 'pasta al forno');
    seedKeyword(db, 'cucina sana');

    setupAllMocks();

    const summary = await runDiscovery(runId, db);

    // Orchestrator summary
    expect(summary.searchesPerformed).toBe(3);
    expect(summary.candidatesFound).toBe(8); // 6 from keywords + 2 from categories
    // channelsEnriched = 8 (enrichment step) + 2 (video-enrichment active channels)
    expect(summary.channelsEnriched).toBe(10);
    // channelsPreRejected = 4 (filter: low subs) + 2 (video-enrichment: inactive)
    expect(summary.channelsPreRejected).toBe(6);
    expect(summary.channelsReadyForQualification).toBe(2); // UC01 and UC02

    // channels table: 8 rows total
    const allChannels = db.select().from(schema.channels).all();
    expect(allChannels).toHaveLength(8);

    const enriched = allChannels.filter((c) => c.discoveryStatus === 'enriched');
    expect(enriched).toHaveLength(2);
    expect(enriched.map((c) => c.id).sort()).toEqual(['UC01', 'UC02']);

    const rejected = allChannels.filter((c) => c.discoveryStatus === 'rejected_pre_qual');
    expect(rejected).toHaveLength(6);

    const belowMinSubs = rejected.filter((c) => c.rejectionReason === 'below_min_subscribers');
    expect(belowMinSubs).toHaveLength(4);
    expect(belowMinSubs.map((c) => c.id).sort()).toEqual(['UC05', 'UC06', 'UC07', 'UC08']);

    const inactive = rejected.filter((c) => c.rejectionReason === 'inactive');
    expect(inactive).toHaveLength(2);
    expect(inactive.map((c) => c.id).sort()).toEqual(['UC03', 'UC04']);

    // videos table: 4 rows (2 per active channel)
    const allVideos = db.select().from(schema.videos).all();
    expect(allVideos).toHaveLength(4);
    expect(allVideos.filter((v) => v.channelId === 'UC01')).toHaveLength(2);
    expect(allVideos.filter((v) => v.channelId === 'UC02')).toHaveLength(2);

    // pipeline_events table
    const allEvents = db.select().from(schema.pipelineEvents).all();
    // 3 discovery_keyword_complete + 11 discovery_category_complete
    // + 1 enrichment_batch_complete + 4 channel_pre_rejected (filter) + 2 channel_pre_rejected (inactive)
    expect(allEvents).toHaveLength(21);
    expect(allEvents.filter((e) => e.event === 'discovery_keyword_complete')).toHaveLength(3);
    expect(allEvents.filter((e) => e.event === 'discovery_category_complete')).toHaveLength(11);
    expect(allEvents.filter((e) => e.event === 'enrichment_batch_complete')).toHaveLength(1);
    expect(allEvents.filter((e) => e.event === 'channel_pre_rejected')).toHaveLength(6);

    // quota_ledger: empty because YouTube operations are mocked
    const quotaRows = db.select().from(schema.quotaLedger).all();
    expect(quotaRows).toHaveLength(0);

    // pipeline run counters match the summary
    const run = db.select().from(schema.pipelineRuns).where(eq(schema.pipelineRuns.id, runId)).get()!;
    expect(run.searchesPerformed).toBe(3);
    expect(run.candidatesFound).toBe(8);
    expect(run.channelsEnriched).toBe(10);
    expect(run.channelsPreRejected).toBe(6);
  });

  it('is idempotent: re-running does not create duplicate channels or videos', async () => {
    const db = makeDb();
    const runId1 = seedRun(db);

    seedKeyword(db, 'cucina italiana');
    seedKeyword(db, 'pasta al forno');
    seedKeyword(db, 'cucina sana');

    setupAllMocks();
    await runDiscovery(runId1, db);

    // Second run: same keywords return the same channel IDs (all already known)
    const runId2 = seedRun(db);
    vi.clearAllMocks();
    _resetSettingsCache();

    mockSearchChannels
      .mockResolvedValueOnce({ channelIds: ['UC01', 'UC02', 'UC03'], rawPath: 'raw/search/1.json' })
      .mockResolvedValueOnce({ channelIds: ['UC04', 'UC05', 'UC03'], rawPath: 'raw/search/2.json' })
      .mockResolvedValueOnce({ channelIds: ['UC06', 'UC01', 'UC05'], rawPath: 'raw/search/3.json' });
    mockGetMostPopularByCategory
      .mockResolvedValueOnce({ channelIds: ['UC07', 'UC02'], rawPath: 'raw/popular/2.json' })
      .mockResolvedValueOnce({ channelIds: ['UC08', 'UC04'], rawPath: 'raw/popular/17.json' })
      .mockResolvedValue({ channelIds: [], rawPath: 'raw/popular/empty.json' });
    // Enrichment skipped (no candidate channels with lastFetchedAt IS NULL)
    // Video enrichment re-runs on UC01 and UC02 (still enriched)
    mockGetUploadsPlaylistItems.mockImplementation(async ({ playlistId }: { playlistId: string }) => {
      if (playlistId === 'UU01') return { videoIds: ['vid01a', 'vid01b'], rawPath: 'raw/playlist/01.json' };
      if (playlistId === 'UU02') return { videoIds: ['vid02a', 'vid02b'], rawPath: 'raw/playlist/02.json' };
      return { videoIds: [], rawPath: 'raw/playlist/empty.json' };
    });
    mockGetVideos.mockImplementation(async ({ channelIdForStorage }: { ids: string[]; channelIdForStorage: string }) => {
      if (channelIdForStorage === 'UC01') {
        return {
          videos: [makeVideoDetail('vid01a', 'UC01'), makeVideoDetail('vid01b', 'UC01')],
          rawPath: 'raw/videos/01.json',
        };
      }
      if (channelIdForStorage === 'UC02') {
        return {
          videos: [makeVideoDetail('vid02a', 'UC02'), makeVideoDetail('vid02b', 'UC02')],
          rawPath: 'raw/videos/02.json',
        };
      }
      return { videos: [], rawPath: null };
    });

    await runDiscovery(runId2, db);

    // channels table still has exactly 8 rows (no duplicates)
    const allChannels = db.select().from(schema.channels).all();
    expect(allChannels).toHaveLength(8);

    // videos table still has exactly 4 rows (onConflictDoNothing prevents duplication)
    const allVideos = db.select().from(schema.videos).all();
    expect(allVideos).toHaveLength(4);
  });
});
