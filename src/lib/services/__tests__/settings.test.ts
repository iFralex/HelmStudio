import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '../../db/schema';
import { setSetting } from '../../db/queries';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PIPELINE_MIN_SUBSCRIBERS: 80000,
    PIPELINE_MAX_SUBSCRIBERS: 1000000,
    PIPELINE_TARGET_COUNTRY: 'IT',
    PIPELINE_TARGET_LANGUAGE: 'it',
    PIPELINE_REQUALIFY_AFTER_DAYS: 90,
    PIPELINE_INACTIVE_DAYS: 60,
    PIPELINE_KEYWORDS_PER_RUN: 30,
    PIPELINE_TARGET_QUALIFIED_PER_RUN: 50,
    LOG_LEVEL: 'info',
    DATA_DIR: '/tmp',
  },
}));

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

import {
  getFilters,
  updateFilters,
  getPipelineConfig,
  updatePipelineConfig,
  _resetSettingsCache,
} from '../settings';

describe.runIf(sqlite3Available)('settings service', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
    _resetSettingsCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getFilters', () => {
    it('returns env defaults when no setting is stored in DB', async () => {
      const filters = await getFilters(db);
      expect(filters).toEqual({
        minSubscribers: 80000,
        maxSubscribers: 1000000,
        country: 'IT',
        language: 'it',
        requalifyAfterDays: 90,
        inactiveDays: 60,
      });
    });

    it('persists env defaults to DB on first read', async () => {
      await getFilters(db);
      _resetSettingsCache();
      const filters = await getFilters(db);
      expect(filters.minSubscribers).toBe(80000);
      expect(filters.country).toBe('IT');
    });

    it('reads from DB when a value is stored', async () => {
      await setSetting(
        'filters',
        {
          minSubscribers: 5000,
          maxSubscribers: 2000000,
          country: 'DE',
          language: 'de',
          requalifyAfterDays: 45,
          inactiveDays: 30,
        },
        db,
      );
      const filters = await getFilters(db);
      expect(filters.country).toBe('DE');
      expect(filters.minSubscribers).toBe(5000);
    });

    it('returns cached value within TTL without re-querying DB', async () => {
      await getFilters(db);
      // Write directly to DB bypassing service (no cache update)
      await setSetting(
        'filters',
        {
          minSubscribers: 99999,
          maxSubscribers: 500000,
          country: 'US',
          language: 'en',
          requalifyAfterDays: 30,
          inactiveDays: 20,
        },
        db,
      );
      // Cache is still valid — should return original value
      const cached = await getFilters(db);
      expect(cached.country).toBe('IT');
    });

    it('re-queries DB after TTL expires', async () => {
      vi.useFakeTimers();
      await getFilters(db);
      // Write new value directly to DB bypassing cache
      await setSetting(
        'filters',
        {
          minSubscribers: 99999,
          maxSubscribers: 500000,
          country: 'US',
          language: 'en',
          requalifyAfterDays: 30,
          inactiveDays: 20,
        },
        db,
      );
      // Advance past the 30s TTL
      vi.advanceTimersByTime(31_000);
      const fresh = await getFilters(db);
      expect(fresh.country).toBe('US');
    });
  });

  describe('updateFilters', () => {
    it('partial update merges with stored value', async () => {
      await getFilters(db); // seed defaults into DB
      const updated = await updateFilters({ minSubscribers: 5000 }, db);
      expect(updated.minSubscribers).toBe(5000);
      expect(updated.maxSubscribers).toBe(1000000);
      expect(updated.country).toBe('IT');
    });

    it('persists update across cache reset', async () => {
      await getFilters(db);
      await updateFilters({ country: 'DE' }, db);
      _resetSettingsCache();
      const reread = await getFilters(db);
      expect(reread.country).toBe('DE');
    });

    it('multiple partial updates accumulate correctly', async () => {
      await getFilters(db);
      await updateFilters({ country: 'FR' }, db);
      await updateFilters({ language: 'fr' }, db);
      _resetSettingsCache();
      const reread = await getFilters(db);
      expect(reread.country).toBe('FR');
      expect(reread.language).toBe('fr');
      expect(reread.minSubscribers).toBe(80000);
    });
  });

  describe('getPipelineConfig', () => {
    it('returns env defaults when no setting is stored in DB', async () => {
      const config = await getPipelineConfig(db);
      expect(config).toEqual({
        keywordsPerRun: 30,
        targetQualifiedPerRun: 50,
      });
    });

    it('persists env defaults to DB on first read', async () => {
      await getPipelineConfig(db);
      _resetSettingsCache();
      const config = await getPipelineConfig(db);
      expect(config.keywordsPerRun).toBe(30);
    });
  });

  describe('updatePipelineConfig', () => {
    it('partial update merges with stored value', async () => {
      await getPipelineConfig(db);
      const updated = await updatePipelineConfig({ keywordsPerRun: 15 }, db);
      expect(updated.keywordsPerRun).toBe(15);
      expect(updated.targetQualifiedPerRun).toBe(50);
    });

    it('persists update across cache reset', async () => {
      await getPipelineConfig(db);
      await updatePipelineConfig({ targetQualifiedPerRun: 100 }, db);
      _resetSettingsCache();
      const reread = await getPipelineConfig(db);
      expect(reread.targetQualifiedPerRun).toBe(100);
    });
  });
});
