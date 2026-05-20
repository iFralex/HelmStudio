import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/pipeline.db');
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle' });

const defaultFilters = {
  minSubscribers: Number(process.env.FILTER_MIN_SUBSCRIBERS ?? 1000),
  maxSubscribers: Number(process.env.FILTER_MAX_SUBSCRIBERS ?? 500000),
  country: process.env.FILTER_COUNTRY ?? null,
  language: process.env.FILTER_LANGUAGE ?? null,
  requalifyAfterDays: Number(process.env.FILTER_REQUALIFY_AFTER_DAYS ?? 90),
  inactiveDays: Number(process.env.FILTER_INACTIVE_DAYS ?? 180),
};

const defaultPipelineConfig = {
  keywordsPerRun: Number(process.env.PIPELINE_KEYWORDS_PER_RUN ?? 3),
  targetQualifiedPerRun: Number(process.env.PIPELINE_TARGET_QUALIFIED_PER_RUN ?? 10),
};

const now = new Date();

db.insert(schema.settings)
  .values({ key: 'filters', value: defaultFilters, updatedAt: now })
  .onConflictDoNothing()
  .run();

db.insert(schema.settings)
  .values({ key: 'pipeline_config', value: defaultPipelineConfig, updatedAt: now })
  .onConflictDoNothing()
  .run();

const settingRows = db.select().from(schema.settings).all();
console.log(`db:init done — ${dbPath} ready, ${settingRows.length} setting(s) seeded`);

sqlite.close();
