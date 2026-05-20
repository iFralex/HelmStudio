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
  minSubscribers: Number(process.env.PIPELINE_MIN_SUBSCRIBERS ?? 80000),
  maxSubscribers: Number(process.env.PIPELINE_MAX_SUBSCRIBERS ?? 1000000),
  country: process.env.PIPELINE_TARGET_COUNTRY ?? 'IT',
  language: process.env.PIPELINE_TARGET_LANGUAGE ?? 'it',
  requalifyAfterDays: Number(process.env.PIPELINE_REQUALIFY_AFTER_DAYS ?? 90),
  inactiveDays: Number(process.env.PIPELINE_INACTIVE_DAYS ?? 60),
};

const defaultPipelineConfig = {
  keywordsPerRun: Number(process.env.PIPELINE_KEYWORDS_PER_RUN ?? 30),
  targetQualifiedPerRun: Number(process.env.PIPELINE_TARGET_QUALIFIED_PER_RUN ?? 50),
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
