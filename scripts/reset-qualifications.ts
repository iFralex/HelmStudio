/**
 * Deletes all qualification rows and resets channel status to 'enriched'
 * so the pipeline will requalify them on the next run.
 *
 * Transcripts and video_selections are preserved — transcripts are reused
 * via the cache in getOrFetchTranscript; video_selections are historical
 * (the pipeline will create fresh ones on requalification, which is fast).
 *
 * Usage:
 *   pnpm tsx scripts/reset-qualifications.ts
 *   pnpm tsx scripts/reset-qualifications.ts --also-rejected   # also reset rejected_post_qual channels
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { inArray } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import path from 'path';
import fs from 'fs';

const alsoRejected = process.argv.includes('--also-rejected');

const dbPath = process.env.DATABASE_PATH ?? path.resolve('data/pipeline.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = OFF'); // allow deleting without cascade issues
sqlite.pragma('journal_mode = WAL');
const db = drizzle(sqlite, { schema });

const statusesToReset: Array<'qualified' | 'rejected_post_qual'> = ['qualified'];
if (alsoRejected) statusesToReset.push('rejected_post_qual');

// 1. Count what we're about to change
const toReset = db
  .select({ id: schema.channels.id, status: schema.channels.discoveryStatus })
  .from(schema.channels)
  .where(inArray(schema.channels.discoveryStatus, statusesToReset))
  .all();

const qualCount = db.select({ id: schema.qualifications.id }).from(schema.qualifications).all().length;

console.log(`Channels to reset: ${toReset.length} (${statusesToReset.join(', ')})`);
console.log(`Qualification rows to delete: ${qualCount}`);
if (alsoRejected) {
  console.log('  --also-rejected: rejected_post_qual channels will be reset to enriched');
}
console.log('');
console.log('Preserving: channels, videos, transcripts, video_selections, pipeline_events, quota_ledger');
console.log('');

if (toReset.length === 0 && qualCount === 0) {
  console.log('Nothing to reset.');
  process.exit(0);
}

// 2. Run inside a transaction
const channelIds = toReset.map((r) => r.id);
sqlite.transaction(() => {
  sqlite.prepare('DELETE FROM qualifications').run();

  if (channelIds.length > 0) {
    const placeholders = channelIds.map(() => '?').join(',');
    sqlite
      .prepare(
        `UPDATE channels
         SET latest_qualification_id = NULL,
             latest_automation_score = NULL,
             last_qualified_at       = NULL,
             rejection_reason        = NULL,
             discovery_status        = 'enriched'
         WHERE id IN (${placeholders})`,
      )
      .run(...channelIds);
  }
})();

console.log(`✓ Deleted ${qualCount} qualification rows`);
console.log(`✓ Reset ${toReset.length} channels to discoveryStatus='enriched'`);
console.log('');
console.log('Next step: run pnpm worker:manual (or trigger via UI) to requalify all enriched channels.');
