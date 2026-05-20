import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
const globalForDb = globalThis as unknown as { _db?: DrizzleDb };

export function getDb(): DrizzleDb {
  if (globalForDb._db) return globalForDb._db;
  const dbPath = process.env.DATABASE_PATH ?? './data/pipeline.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  globalForDb._db = drizzle(sqlite, { schema });
  return globalForDb._db;
}
