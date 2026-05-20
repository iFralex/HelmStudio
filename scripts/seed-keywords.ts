import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';
import { config as loadDotenv } from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  loadDotenv({ path: resolve(process.cwd(), '.env') });
}

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/lib/db/schema';
import { SEED_KEYWORDS } from '../src/lib/seeds/keywords';

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/pipeline.db');
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

const db = drizzle(sqlite, { schema });

let inserted = 0;
let skipped = 0;

for (const keyword of SEED_KEYWORDS) {
  const result = db.insert(schema.seedKeywords).values({ keyword }).onConflictDoNothing().run();
  if (result.changes > 0) {
    inserted++;
  } else {
    skipped++;
  }
}

console.log(`✓ Keywords seeded: ${inserted} inserted, ${skipped} already present`);

sqlite.close();
