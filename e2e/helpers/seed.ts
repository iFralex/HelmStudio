import path from 'path';
import type BetterSqlite3 from 'better-sqlite3';

export type TestDb = BetterSqlite3.Database;

function dbPath(): string {
  return process.env['DATABASE_PATH'] ?? path.join(process.cwd(), 'data', 'pipeline.db');
}

export function openTestDb(): TestDb | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof BetterSqlite3;
    const db = new Database(dbPath());
    db.pragma('foreign_keys = ON');
    return db;
  } catch {
    return null;
  }
}

export function insertTestRun(db: TestDb): number {
  const stmt = db.prepare(`
    INSERT INTO pipeline_runs (status, triggered_by, started_at, finished_at,
      searches_performed, candidates_found, channels_enriched, channels_pre_rejected,
      channels_qualified, channels_post_rejected, youtube_quota_used,
      llm_calls_count, llm_tokens_input, llm_tokens_output, error_message)
    VALUES ('completed', 'manual', strftime('%s','now'), strftime('%s','now'),
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'e2etest-run')
  `);
  return Number(stmt.run().lastInsertRowid);
}

export function insertTestChannel(
  db: TestDb,
  id: string,
  opts: {
    title?: string;
    discoveryStatus?: string;
    outreachStatus?: string;
    subscriberCount?: number;
    score?: number | null;
  } = {},
) {
  db.prepare(`
    INSERT OR REPLACE INTO channels (
      id, title, discovery_status, outreach_status, subscriber_count,
      latest_automation_score, discovered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))
  `).run(
    id,
    opts.title ?? `e2etest channel ${id}`,
    opts.discoveryStatus ?? 'qualified',
    opts.outreachStatus ?? 'none',
    opts.subscriberCount ?? 10000,
    opts.score ?? null,
  );
}

export function insertTestQualification(
  db: TestDb,
  channelId: string,
  runId: number,
  score: number,
  niche = 'E2ETestNiche',
): number {
  const res = db
    .prepare(`
    INSERT INTO qualifications (
      channel_id, run_id, model_used, prompt_version,
      raw_response_path, raw_prompt_path,
      automation_potential_score, niche_classification, format_type, pitch_language,
      created_at
    )
    VALUES (?, ?, 'test-model', 'v1', 'raw/test.json', 'raw/test.json',
      ?, ?, 'Tutorial', 'it', strftime('%s','now'))
  `)
    .run(channelId, runId, score, niche);
  const qualId = Number(res.lastInsertRowid);
  db.prepare(`
    UPDATE channels
    SET latest_qualification_id = ?,
        latest_automation_score = ?,
        last_qualified_at = strftime('%s','now'),
        discovery_status = 'qualified'
    WHERE id = ?
  `).run(qualId, score, channelId);
  return qualId;
}

export function cleanupTestChannels(db: TestDb): void {
  db.prepare(`DELETE FROM channels WHERE id LIKE 'e2etest-%'`).run();
  db.prepare(`DELETE FROM pipeline_runs WHERE error_message = 'e2etest-run'`).run();
}
