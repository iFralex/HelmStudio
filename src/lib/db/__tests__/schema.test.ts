import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach } from 'vitest';
import * as schema from '../schema';
import {
  channels,
  videos,
  videoSelections,
  transcripts,
  qualifications,
  outreachDrafts,
  settings,
} from '../schema';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

describe.runIf(sqlite3Available)('database schema', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  it('inserts and reads a channel', () => {
    db.insert(channels).values({ id: 'UCtest1', title: 'Test Channel' }).run();
    const row = db.select().from(channels).where(eq(channels.id, 'UCtest1')).get();
    expect(row).toBeDefined();
    expect(row?.id).toBe('UCtest1');
    expect(row?.title).toBe('Test Channel');
    expect(row?.discoveryStatus).toBe('candidate');
    expect(row?.outreachStatus).toBe('none');
  });

  it('cascade-deletes videos, qualifications, and outreach drafts when channel is deleted', () => {
    db.insert(channels).values({ id: 'UCcasc', title: 'Cascade Channel' }).run();
    db.insert(videos)
      .values({ id: 'vid1', channelId: 'UCcasc', title: 'Test Video', publishedAt: new Date(2024, 0, 1) })
      .run();
    db.insert(transcripts)
      .values({
        videoId: 'vid1',
        channelId: 'UCcasc',
        source: 'youtube_transcript',
      })
      .run();
    db.insert(videoSelections)
      .values({
        channelId: 'UCcasc',
        videoClassifications: [],
        selectedVideoIds: [],
        modelUsed: 'gpt-4o',
        promptVersion: 'v1',
        rawResponsePath: '/tmp/vsel.json',
      })
      .run();
    db.insert(qualifications)
      .values({
        channelId: 'UCcasc',
        modelUsed: 'gpt-4o',
        promptVersion: 'v1',
        rawResponsePath: '/tmp/raw.json',
        rawPromptPath: '/tmp/prompt.txt',
      })
      .run();
    db.insert(outreachDrafts)
      .values({
        channelId: 'UCcasc',
        language: 'it',
        subject: 'Test Subject',
        body: 'Test Body',
        modelUsed: 'gpt-4o',
        promptVersion: 'v1',
        rawResponsePath: '/tmp/draft.json',
      })
      .run();

    db.delete(channels).where(eq(channels.id, 'UCcasc')).run();

    const vids = db.select().from(videos).where(eq(videos.channelId, 'UCcasc')).all();
    const txs = db.select().from(transcripts).where(eq(transcripts.channelId, 'UCcasc')).all();
    const vsels = db.select().from(videoSelections).where(eq(videoSelections.channelId, 'UCcasc')).all();
    const quals = db.select().from(qualifications).where(eq(qualifications.channelId, 'UCcasc')).all();
    const drafts = db.select().from(outreachDrafts).where(eq(outreachDrafts.channelId, 'UCcasc')).all();

    expect(vids).toHaveLength(0);
    expect(txs).toHaveLength(0);
    expect(vsels).toHaveLength(0);
    expect(quals).toHaveLength(0);
    expect(drafts).toHaveLength(0);
  });

  it('rejects duplicate channel id (PK constraint)', () => {
    db.insert(channels).values({ id: 'UCdup', title: 'First' }).run();
    expect(() => db.insert(channels).values({ id: 'UCdup', title: 'Second' }).run()).toThrow();
  });

  it('stores and retrieves JSON-mode columns round-trip', () => {
    const tags = ['automation', 'productivity', 'tools'];
    db.insert(channels).values({ id: 'UCjson', title: 'JSON Channel' }).run();
    db.insert(videos)
      .values({ id: 'vidjson', channelId: 'UCjson', title: 'JSON Video', publishedAt: new Date(2024, 5, 15), tags })
      .run();
    const row = db.select().from(videos).where(eq(videos.id, 'vidjson')).get();
    expect(row?.tags).toEqual(tags);
  });

  it('settings upsert: insert then update on conflict', () => {
    const key = 'filters';
    const initial = { minSubscribers: 1000 };
    const updated = { minSubscribers: 5000, country: 'IT' };

    db.insert(settings).values({ key, value: initial }).run();
    const first = db.select().from(settings).where(eq(settings.key, key)).get();
    expect(first?.value).toEqual(initial);

    db.insert(settings)
      .values({ key, value: updated })
      .onConflictDoUpdate({ target: settings.key, set: { value: updated } })
      .run();
    const second = db.select().from(settings).where(eq(settings.key, key)).get();
    expect(second?.value).toEqual(updated);
  });
});
