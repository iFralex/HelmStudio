import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect } from 'vitest';
import * as schema from '../../db/schema';
import { computeChannelAggregates } from '../aggregates';

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

function seedChannel(db: Db, id: string): void {
  db.insert(schema.channels).values({ id, title: `Channel ${id}` }).run();
}

interface VideoSeed {
  id: string;
  channelId: string;
  title?: string;
  publishedAt?: Date;
  durationSeconds?: number | null;
  viewCount?: number | null;
  categoryId?: string | null;
}

function seedVideo(db: Db, v: VideoSeed): void {
  db.insert(schema.videos)
    .values({
      id: v.id,
      channelId: v.channelId,
      title: v.title ?? `Video ${v.id}`,
      publishedAt: v.publishedAt ?? new Date(),
      durationSeconds: v.durationSeconds !== undefined ? v.durationSeconds : 300,
      viewCount: v.viewCount !== undefined ? v.viewCount : 1000,
      categoryId: v.categoryId !== undefined ? v.categoryId : '22',
    })
    .run();
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const WEEKS_IN_90_DAYS = 90 / 7;

describe.runIf(sqlite3Available)('computeChannelAggregates', () => {
  it('returns zeros for channel with no videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    const result = await computeChannelAggregates('UCaaa', db);
    expect(result).toEqual({
      uploadsPerWeekLast90d: 0,
      avgDurationSeconds: 0,
      durationStddevSeconds: 0,
      avgViews: 0,
      distinctCategories: 0,
      titleLengthStddev: 0,
    });
  });

  it('returns zeros for channel with fewer than 3 videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    seedVideo(db, { id: 'v1', channelId: 'UCaaa' });
    seedVideo(db, { id: 'v2', channelId: 'UCaaa' });
    const result = await computeChannelAggregates('UCaaa', db);
    expect(result).toEqual({
      uploadsPerWeekLast90d: 0,
      avgDurationSeconds: 0,
      durationStddevSeconds: 0,
      avgViews: 0,
      distinctCategories: 0,
      titleLengthStddev: 0,
    });
  });

  it('counts uploads in last 90 days per week', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    // 5 recent videos within 90 days, 1 old video outside the window
    for (let i = 1; i <= 5; i++) {
      seedVideo(db, { id: `v${i}`, channelId: 'UCaaa', publishedAt: daysAgo(i * 10) });
    }
    seedVideo(db, { id: 'v6', channelId: 'UCaaa', publishedAt: daysAgo(100) });

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.uploadsPerWeekLast90d).toBeCloseTo(5 / WEEKS_IN_90_DAYS);
  });

  it('computes average duration and population stddev', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    const durations = [100, 200, 300];
    for (let i = 0; i < durations.length; i++) {
      seedVideo(db, { id: `v${i + 1}`, channelId: 'UCaaa', durationSeconds: durations[i] });
    }

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.avgDurationSeconds).toBeCloseTo(200);
    // population stddev: sqrt(((100-200)^2 + 0 + (300-200)^2) / 3) = sqrt(20000/3)
    expect(result.durationStddevSeconds).toBeCloseTo(Math.sqrt(20000 / 3));
  });

  it('computes average view count', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    const views = [1000, 2000, 3000];
    for (let i = 0; i < views.length; i++) {
      seedVideo(db, { id: `v${i + 1}`, channelId: 'UCaaa', viewCount: views[i] });
    }

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.avgViews).toBeCloseTo(2000);
  });

  it('counts distinct non-null category IDs', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    const categories: Array<string | null> = ['22', '22', '17', null];
    for (let i = 0; i < categories.length; i++) {
      seedVideo(db, { id: `v${i + 1}`, channelId: 'UCaaa', categoryId: categories[i] });
    }

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.distinctCategories).toBe(2);
  });

  it('computes title length population stddev', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    const titles = ['abc', 'abcde', 'abcdefg']; // lengths: 3, 5, 7
    for (let i = 0; i < titles.length; i++) {
      seedVideo(db, { id: `v${i + 1}`, channelId: 'UCaaa', title: titles[i] });
    }

    const result = await computeChannelAggregates('UCaaa', db);
    // mean=5, variance=((3-5)^2 + (5-5)^2 + (7-5)^2)/3 = 8/3
    expect(result.titleLengthStddev).toBeCloseTo(Math.sqrt(8 / 3));
  });

  it('excludes null durationSeconds from duration stats', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    seedVideo(db, { id: 'v1', channelId: 'UCaaa', durationSeconds: 100 });
    seedVideo(db, { id: 'v2', channelId: 'UCaaa', durationSeconds: null });
    seedVideo(db, { id: 'v3', channelId: 'UCaaa', durationSeconds: 300 });

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.avgDurationSeconds).toBeCloseTo(200);
  });

  it('limits computation to 20 most recent videos', async () => {
    const db = makeDb();
    seedChannel(db, 'UCaaa');
    // 20 recent videos with viewCount=1000
    for (let i = 1; i <= 20; i++) {
      seedVideo(db, { id: `v${i}`, channelId: 'UCaaa', publishedAt: daysAgo(i), viewCount: 1000 });
    }
    // 5 older videos with viewCount=9999 that should be excluded
    for (let i = 21; i <= 25; i++) {
      seedVideo(db, { id: `v${i}`, channelId: 'UCaaa', publishedAt: daysAgo(200 + i), viewCount: 9999 });
    }

    const result = await computeChannelAggregates('UCaaa', db);
    expect(result.avgViews).toBeCloseTo(1000);
  });
});
