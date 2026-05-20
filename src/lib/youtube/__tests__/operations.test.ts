import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '../../db/schema';
import searchFixture from './fixtures/search.list.json';
import channelsFixture from './fixtures/channels.list.json';
import videosFixture from './fixtures/videos.list.json';

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

// Hoisted mock functions so they are accessible outside vi.mock factories
const { mockSearchList, mockChannelsList, mockVideosList, mockPlaylistItemsList, mockDumpRaw } =
  vi.hoisted(() => ({
    mockSearchList: vi.fn(),
    mockChannelsList: vi.fn(),
    mockVideosList: vi.fn(),
    mockPlaylistItemsList: vi.fn(),
    mockDumpRaw: vi.fn().mockImplementation(async (rel: string) => rel),
  }));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: 10000,
    PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: 500,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    DATA_DIR: '/tmp/yt-test-data',
    DATABASE_PATH: ':memory:',
  },
}));

vi.mock('../client', () => ({
  getYoutube: () => ({
    search: { list: mockSearchList },
    channels: { list: mockChannelsList },
    videos: { list: mockVideosList },
    playlistItems: { list: mockPlaylistItemsList },
  }),
}));

vi.mock('../../storage/raw', () => ({
  dumpRaw: mockDumpRaw,
  loadRaw: vi.fn(),
}));

import {
  searchChannels,
  getChannels,
  getVideos,
  getMostPopularByCategory,
  getUploadsPlaylistItems,
} from '../operations';
import { QuotaExhausted, recordQuotaUse, pacificDateString } from '../quota';
import { dumpRaw } from '../../storage/raw';

function makeChannelItem(id: string) {
  return {
    kind: 'youtube#channel',
    etag: `etag-${id}`,
    id,
    snippet: {
      title: `Channel ${id}`,
      publishedAt: '2020-01-01T00:00:00Z',
      country: 'IT',
      customUrl: `@${id.toLowerCase()}`,
      thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
    },
    statistics: { subscriberCount: '50000', viewCount: '1000000', videoCount: '100' },
    contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } },
  };
}

function makeVideoItem(id: string, channelId: string) {
  return {
    kind: 'youtube#video',
    etag: `etag-${id}`,
    id,
    snippet: {
      publishedAt: '2024-01-15T10:00:00Z',
      channelId,
      title: `Video ${id}`,
      tags: ['news'],
      categoryId: '25',
      defaultLanguage: 'it',
    },
    contentDetails: { duration: 'PT10M30S' },
    statistics: { viewCount: '10000', likeCount: '500', commentCount: '50' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDumpRaw.mockImplementation(async (rel: string) => rel);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('searchChannels', () => {
  it.runIf(sqlite3Available)('parses channelIds and nextPageToken from fixture', async () => {
    mockSearchList.mockResolvedValue({ data: searchFixture });
    const db = makeDb();
    const result = await searchChannels({ query: 'rassegna stampa' }, db);
    expect(result.channelIds).toEqual(['UCchannel1abc', 'UCchannel2def', 'UCchannel3ghi']);
    expect(result.nextPageToken).toBe('CAUQAA');
  });

  it.runIf(sqlite3Available)('returns rawPath equal to the path passed to dumpRaw', async () => {
    mockSearchList.mockResolvedValue({ data: searchFixture });
    const db = makeDb();
    const result = await searchChannels({ query: 'test' }, db);
    expect(vi.mocked(dumpRaw)).toHaveBeenCalledOnce();
    const [calledPath] = vi.mocked(dumpRaw).mock.calls[0]!;
    expect(result.rawPath).toBe(calledPath);
    expect(result.rawPath).toMatch(/^raw[/\\]youtube[/\\]search[/\\]/);
  });

  it.runIf(sqlite3Available)('handles missing nextPageToken (last page)', async () => {
    mockSearchList.mockResolvedValue({
      data: { ...searchFixture, nextPageToken: undefined },
    });
    const db = makeDb();
    const result = await searchChannels({ query: 'test' }, db);
    expect(result.nextPageToken).toBeNull();
  });

  it.runIf(sqlite3Available)('throws QuotaExhausted when budget is tight', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // search.list costs 100; cap = 10000 - 500 = 9500; 9450 + 100 = 9550 > 9500
    db.insert(schema.quotaLedger).values({ date: today, operation: 'search.list', units: 9450 }).run();
    await expect(searchChannels({ query: 'test' }, db)).rejects.toThrow(QuotaExhausted);
    expect(mockSearchList).not.toHaveBeenCalled();
  });
});

describe('getChannels', () => {
  it.runIf(sqlite3Available)('maps channel fields from fixture correctly', async () => {
    mockChannelsList.mockResolvedValue({ data: channelsFixture });
    const db = makeDb();
    const result = await getChannels({ ids: ['UCchannel1abc'] }, db);
    expect(result.channels).toHaveLength(1);
    const ch = result.channels[0]!;
    expect(ch.id).toBe('UCchannel1abc');
    expect(ch.title).toBe('Rassegna Stampa News');
    expect(ch.subscriberCount).toBe(120000);
    expect(ch.uploadsPlaylistId).toBe('UUchannel1abc');
    expect(ch.country).toBe('IT');
  });

  it.runIf(sqlite3Available)('batches >50 ids into multiple calls and aggregates results', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `UCchannel${String(i + 1).padStart(3, '0')}`);
    const batch1Items = ids.slice(0, 50).map(makeChannelItem);
    const batch2Items = ids.slice(50).map(makeChannelItem);
    mockChannelsList
      .mockResolvedValueOnce({ data: { kind: 'youtube#channelListResponse', items: batch1Items } })
      .mockResolvedValueOnce({ data: { kind: 'youtube#channelListResponse', items: batch2Items } });

    const db = makeDb();
    const result = await getChannels({ ids }, db);

    expect(mockChannelsList).toHaveBeenCalledTimes(2);
    expect(result.channels).toHaveLength(51);
    expect(result.channels[0]!.id).toBe('UCchannel001');
    expect(result.channels[50]!.id).toBe('UCchannel051');
  });

  it.runIf(sqlite3Available)('rawPaths are keyed by channelId', async () => {
    const items = ['UCaaa', 'UCbbb'].map(makeChannelItem);
    mockChannelsList.mockResolvedValue({ data: { items } });
    const db = makeDb();
    const result = await getChannels({ ids: ['UCaaa', 'UCbbb'] }, db);
    expect(result.rawPaths).toHaveProperty('UCaaa');
    expect(result.rawPaths).toHaveProperty('UCbbb');
    expect(result.rawPaths['UCaaa']).toMatch(/^raw[/\\]youtube[/\\]channels[/\\]UCaaa[/\\]/);
  });

  it.runIf(sqlite3Available)('throws QuotaExhausted when budget is tight', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // channels.list costs 1; cap = 9500; 9500 already spent → 9500 + 1 > 9500
    db.insert(schema.quotaLedger).values({ date: today, operation: 'channels.list', units: 9500 }).run();
    await expect(getChannels({ ids: ['UCtest'] }, db)).rejects.toThrow(QuotaExhausted);
    expect(mockChannelsList).not.toHaveBeenCalled();
  });
});

describe('getVideos', () => {
  it.runIf(sqlite3Available)('parses video fields from fixture correctly', async () => {
    mockVideosList.mockResolvedValue({ data: videosFixture });
    const db = makeDb();
    const result = await getVideos({ ids: ['video123abc'], channelIdForStorage: 'UCchannel1abc' }, db);
    expect(result.videos).toHaveLength(1);
    const v = result.videos[0]!;
    expect(v.id).toBe('video123abc');
    expect(v.title).toBe('Rassegna Stampa del 15 Gennaio');
    expect(v.duration).toBe('PT15M42S');
    expect(v.durationSeconds).toBe(942); // 15*60 + 42
    expect(v.viewCount).toBe(25000);
    expect(v.likeCount).toBe(1200);
  });

  it.runIf(sqlite3Available)('batches >50 ids into multiple calls', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `video${String(i + 1).padStart(3, '0')}`);
    const batch1 = ids.slice(0, 50).map((id) => makeVideoItem(id, 'UCchannel1'));
    const batch2 = ids.slice(50).map((id) => makeVideoItem(id, 'UCchannel1'));
    mockVideosList
      .mockResolvedValueOnce({ data: { items: batch1 } })
      .mockResolvedValueOnce({ data: { items: batch2 } });

    const db = makeDb();
    const result = await getVideos({ ids, channelIdForStorage: 'UCchannel1' }, db);
    expect(mockVideosList).toHaveBeenCalledTimes(2);
    expect(result.videos).toHaveLength(51);
  });

  it.runIf(sqlite3Available)('parses duration PT10M30S to 630 seconds', async () => {
    mockVideosList.mockResolvedValue({ data: { items: [makeVideoItem('vid1', 'UCchannel1')] } });
    const db = makeDb();
    const result = await getVideos({ ids: ['vid1'], channelIdForStorage: 'UCchannel1' }, db);
    expect(result.videos[0]!.durationSeconds).toBe(630);
  });

  it.runIf(sqlite3Available)('parses duration P1DT2H3M4S (>24 h) to correct seconds', async () => {
    const item = makeVideoItem('vlong', 'UCchannel1');
    item.contentDetails = { duration: 'P1DT2H3M4S' };
    mockVideosList.mockResolvedValue({ data: { items: [item] } });
    const db = makeDb();
    const result = await getVideos({ ids: ['vlong'], channelIdForStorage: 'UCchannel1' }, db);
    expect(result.videos[0]!.durationSeconds).toBe(86400 + 2 * 3600 + 3 * 60 + 4);
  });

  it.runIf(sqlite3Available)('throws QuotaExhausted when budget is tight', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // videos.list costs 1; cap = 9500; 9500 already spent
    db.insert(schema.quotaLedger).values({ date: today, operation: 'videos.list', units: 9500 }).run();
    await expect(
      getVideos({ ids: ['vid1'], channelIdForStorage: 'UCchannel1' }, db),
    ).rejects.toThrow(QuotaExhausted);
    expect(mockVideosList).not.toHaveBeenCalled();
  });
});

describe('getMostPopularByCategory', () => {
  it.runIf(sqlite3Available)('returns deduplicated channelIds from video items', async () => {
    mockVideosList.mockResolvedValue({
      data: {
        kind: 'youtube#videoListResponse',
        items: [
          { snippet: { channelId: 'UCaaa' } },
          { snippet: { channelId: 'UCbbb' } },
          { snippet: { channelId: 'UCaaa' } }, // duplicate
        ],
      },
    });
    const db = makeDb();
    const result = await getMostPopularByCategory({ categoryId: '25' }, db);
    expect(result.channelIds).toEqual(['UCaaa', 'UCbbb']);
  });

  it.runIf(sqlite3Available)('rawPath contains the categoryId', async () => {
    mockVideosList.mockResolvedValue({ data: { items: [] } });
    const db = makeDb();
    const result = await getMostPopularByCategory({ categoryId: '25' }, db);
    expect(result.rawPath).toContain('25');
  });

  it.runIf(sqlite3Available)('throws QuotaExhausted when budget is tight', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // videos.list costs 1; cap = 9500; 9500 already spent
    db.insert(schema.quotaLedger).values({ date: today, operation: 'videos.list', units: 9500 }).run();
    await expect(getMostPopularByCategory({ categoryId: '25' }, db)).rejects.toThrow(QuotaExhausted);
    expect(mockVideosList).not.toHaveBeenCalled();
  });
});

describe('getUploadsPlaylistItems', () => {
  it.runIf(sqlite3Available)('extracts videoIds from playlist items', async () => {
    mockPlaylistItemsList.mockResolvedValue({
      data: {
        kind: 'youtube#playlistItemListResponse',
        items: [
          { contentDetails: { videoId: 'vid1abc' } },
          { contentDetails: { videoId: 'vid2def' } },
        ],
      },
    });
    const db = makeDb();
    const result = await getUploadsPlaylistItems({ playlistId: 'UUchannel1abc' }, db);
    expect(result.videoIds).toEqual(['vid1abc', 'vid2def']);
  });

  it.runIf(sqlite3Available)('derives channelId from UU-prefixed playlistId for rawPath', async () => {
    mockPlaylistItemsList.mockResolvedValue({ data: { items: [] } });
    const db = makeDb();
    const result = await getUploadsPlaylistItems({ playlistId: 'UUchannel1abc' }, db);
    expect(result.rawPath).toContain('UCchannel1abc');
  });

  it.runIf(sqlite3Available)('uses playlistId directly for rawPath when not UU-prefixed', async () => {
    mockPlaylistItemsList.mockResolvedValue({ data: { items: [] } });
    const db = makeDb();
    // Non-UU playlist ID used as-is for path (must pass assertChannelId validation)
    const result = await getUploadsPlaylistItems({ playlistId: 'UCcustom123' }, db);
    expect(result.rawPath).toContain('UCcustom123');
  });

  it.runIf(sqlite3Available)('throws QuotaExhausted when budget is tight', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const today = pacificDateString();
    // playlistItems.list costs 1; cap = 9500; 9500 already spent
    db.insert(schema.quotaLedger).values({ date: today, operation: 'playlistItems.list', units: 9500 }).run();
    await expect(getUploadsPlaylistItems({ playlistId: 'UUchannel1abc' }, db)).rejects.toThrow(QuotaExhausted);
    expect(mockPlaylistItemsList).not.toHaveBeenCalled();
  });
});

describe('recordQuotaUse', () => {
  it.runIf(sqlite3Available)('persists a ledger row with correct operation and units', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    await recordQuotaUse('search.list', undefined, db);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe('search.list');
    expect(rows[0]!.units).toBe(100);
    expect(rows[0]!.date).toBe('2024-03-15');
  });

  it.runIf(sqlite3Available)('accumulates multiple operation rows', async () => {
    const db = makeDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    await recordQuotaUse('search.list', undefined, db);
    await recordQuotaUse('channels.list', undefined, db);
    await recordQuotaUse('videos.list', undefined, db);
    const rows = db.select().from(schema.quotaLedger).all();
    expect(rows).toHaveLength(3);
    const total = rows.reduce((sum, r) => sum + r.units, 0);
    expect(total).toBe(102); // 100 + 1 + 1
  });
});

describe('raw blob path round-trip', () => {
  it.runIf(sqlite3Available)('searchChannels rawPath is what dumpRaw received', async () => {
    mockSearchList.mockResolvedValue({ data: searchFixture });
    const db = makeDb();
    const result = await searchChannels({ query: 'rassegna stampa' }, db);
    const calls = vi.mocked(dumpRaw).mock.calls;
    expect(calls).toHaveLength(1);
    expect(result.rawPath).toBe(calls[0]![0]);
    expect(result.rawPath).toMatch(/^raw[/\\]youtube[/\\]search[/\\]/);
    expect(result.rawPath).toMatch(/\.json$/);
  });

  it.runIf(sqlite3Available)('getChannels rawPaths all end in .json', async () => {
    const items = ['UCaaa', 'UCbbb', 'UCccc'].map(makeChannelItem);
    mockChannelsList.mockResolvedValue({ data: { items } });
    const db = makeDb();
    const result = await getChannels({ ids: ['UCaaa', 'UCbbb', 'UCccc'] }, db);
    for (const p of Object.values(result.rawPaths)) {
      expect(p).toMatch(/\.json$/);
    }
  });

  it.runIf(sqlite3Available)('getVideos rawPath contains the channelId', async () => {
    mockVideosList.mockResolvedValue({ data: { items: [makeVideoItem('v1', 'UCstored')] } });
    const db = makeDb();
    const result = await getVideos({ ids: ['v1'], channelIdForStorage: 'UCstored' }, db);
    expect(result.rawPath).toContain('UCstored');
  });
});
