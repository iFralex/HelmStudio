import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '../../db/schema';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

let tmpDir: string;

vi.mock('@/lib/env', () => ({
  env: {
    get DATA_DIR() {
      return tmpDir;
    },
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}));

const { mockFetchTranscript } = vi.hoisted(() => ({
  mockFetchTranscript: vi.fn(),
}));

vi.mock('../fetcher', () => ({
  fetchTranscript: mockFetchTranscript,
}));

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

import { getOrFetchTranscript, deleteTranscriptsForChannel } from '../store';

const VIDEO_ID = 'vid-abc123';
const CHANNEL_ID = 'chan-xyz456';

const SUCCESS_RESULT = {
  ok: true as const,
  videoId: VIDEO_ID,
  language: 'it',
  segments: [{ text: 'Ciao', start: 0, duration: 2 }],
  text: 'Ciao',
  characterCount: 4,
};

const FAILURE_RESULT = {
  ok: false as const,
  videoId: VIDEO_ID,
  reason: 'no_captions' as const,
  message: 'Transcript is disabled',
};

describe.runIf(sqlite3Available)('getOrFetchTranscript', () => {
  let db: Db;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-test-'));
    db = makeDb();
    mockFetchTranscript.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('first call fetches, writes DB row and raw file; second call returns from cache', async () => {
    mockFetchTranscript.mockResolvedValueOnce(SUCCESS_RESULT);

    const first = await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);

    expect(first.ok).toBe(true);
    expect(mockFetchTranscript).toHaveBeenCalledOnce();

    const rows = db.select().from(schema.transcripts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fetchSucceeded).toBe(true);
    expect(rows[0]!.text).toBe('Ciao');
    expect(rows[0]!.language).toBe('it');

    const rawFile = path.join(tmpDir, 'raw', 'transcripts', CHANNEL_ID, `${VIDEO_ID}.json`);
    const contents = JSON.parse(await fs.readFile(rawFile, 'utf8')) as { language: string };
    expect(contents.language).toBe('it');

    const second = await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);
    expect(second.ok).toBe(true);
    expect(mockFetchTranscript).toHaveBeenCalledOnce();
  });

  it('stores a failure row and short-circuits subsequent calls within 24h', async () => {
    mockFetchTranscript.mockResolvedValueOnce(FAILURE_RESULT);

    const first = await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);

    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.reason).toBe('no_captions');
    }
    expect(mockFetchTranscript).toHaveBeenCalledOnce();

    const rows = db.select().from(schema.transcripts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fetchSucceeded).toBe(false);
    expect(rows[0]!.fetchError).toBe('no_captions: Transcript is disabled');

    const second = await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('no_captions');
    }
    expect(mockFetchTranscript).toHaveBeenCalledOnce();
  });

  it('re-fetches after the 24h failure cache expires', async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    db
      .insert(schema.transcripts)
      .values({
        videoId: VIDEO_ID,
        channelId: CHANNEL_ID,
        source: 'youtube_transcript',
        fetchSucceeded: false,
        fetchError: 'no_captions: old error',
        fetchedAt: staleDate,
      })
      .run();

    mockFetchTranscript.mockResolvedValueOnce(SUCCESS_RESULT);

    const result = await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);

    expect(result.ok).toBe(true);
    expect(mockFetchTranscript).toHaveBeenCalledOnce();
  });

  it('returns cached success without re-fetching on repeated calls', async () => {
    mockFetchTranscript.mockResolvedValue(SUCCESS_RESULT);

    await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);
    await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);
    await getOrFetchTranscript({ videoId: VIDEO_ID, channelId: CHANNEL_ID }, db);

    expect(mockFetchTranscript).toHaveBeenCalledOnce();
  });
});

describe.runIf(sqlite3Available)('deleteTranscriptsForChannel', () => {
  let db: Db;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-test-'));
    db = makeDb();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('removes DB rows and raw directory for the channel', async () => {
    db
      .insert(schema.transcripts)
      .values([
        {
          videoId: VIDEO_ID,
          channelId: CHANNEL_ID,
          source: 'youtube_transcript',
          fetchSucceeded: false,
          fetchedAt: new Date(),
        },
        {
          videoId: 'vid-other',
          channelId: 'other-channel',
          source: 'youtube_transcript',
          fetchSucceeded: false,
          fetchedAt: new Date(),
        },
      ])
      .run();

    const rawDir = path.join(tmpDir, 'raw', 'transcripts', CHANNEL_ID);
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(path.join(rawDir, `${VIDEO_ID}.json`), '{}');

    await deleteTranscriptsForChannel(CHANNEL_ID, db);

    const remaining = db.select().from(schema.transcripts).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.channelId).toBe('other-channel');

    await expect(fs.access(rawDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not throw when channel has no DB rows or raw files', async () => {
    await expect(deleteTranscriptsForChannel('nonexistent', db)).resolves.toBeUndefined();
  });

  it('throws for invalid channelId', async () => {
    await expect(deleteTranscriptsForChannel('../evil', db)).rejects.toThrow('Invalid channelId');
  });
});
