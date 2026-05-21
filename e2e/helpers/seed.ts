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

export function insertTestVideo(
  db: TestDb,
  id: string,
  channelId: string,
  opts: { title?: string; publishedAt?: number } = {},
): void {
  db.prepare(`
    INSERT OR REPLACE INTO videos (id, channel_id, title, published_at, duration, duration_seconds, view_count)
    VALUES (?, ?, ?, ?, 'PT10M', 600, 1000)
  `).run(
    id,
    channelId,
    opts.title ?? `e2etest video ${id}`,
    opts.publishedAt ?? Math.floor(Date.now() / 1000) - 86400,
  );
}

export function insertTestVideoSelection(
  db: TestDb,
  channelId: string,
  runId: number,
  selectedVideoIds: string[],
  classifications: object[],
): number {
  const res = db
    .prepare(`
    INSERT INTO video_selections (
      channel_id, run_id, video_classifications, selected_video_ids,
      format_consistency_summary, selection_rationale,
      model_used, prompt_version, raw_response_path
    )
    VALUES (?, ?, ?, ?, 'Formato consistente: tutorial settimanale.', 'Video selezionati per analisi approfondita.', 'test-model', 'v1', 'raw/test.json')
  `)
    .run(channelId, runId, JSON.stringify(classifications), JSON.stringify(selectedVideoIds));
  return Number(res.lastInsertRowid);
}

export function insertTestQualificationFull(
  db: TestDb,
  channelId: string,
  runId: number,
  videoSelectionId: number,
  score: number,
): number {
  const res = db
    .prepare(`
    INSERT INTO qualifications (
      channel_id, run_id, video_selection_id, model_used, prompt_version,
      raw_response_path, raw_prompt_path,
      automation_potential_score, niche_classification, format_type, pitch_language,
      rationale, suggested_solution, pitch_angle, confidence,
      signals, disqualifiers, automatable_workflows, created_at
    )
    VALUES (?, ?, ?, 'test-model', 'v1', 'raw/test.json', 'raw/test.json',
      ?, 'Podcast Educativo', 'Tutorial', 'it',
      'Il canale produce tutorial di alta qualita''.',
      'Automazione della post-produzione con AI.',
      'Focus su risparmio di tempo nella produzione.',
      0.85,
      '[{"type":"positive","evidence":"Alta consistenza dei formati","videoId":null}]',
      '[]',
      '[{"name":"Montaggio AI","description":"Automazione del montaggio video","automationApproach":"Script AI per il taglio","estimatedTimeSavedPerVideoMinutes":45}]',
      strftime('%s','now'))
  `)
    .run(channelId, runId, videoSelectionId, score);
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

export function insertTestTranscript(
  db: TestDb,
  videoId: string,
  channelId: string,
  text: string,
): void {
  db.prepare(`
    INSERT OR REPLACE INTO transcripts (
      video_id, channel_id, language, source, text, character_count, fetch_succeeded
    )
    VALUES (?, ?, 'it', 'youtube_transcript', ?, ?, 1)
  `).run(videoId, channelId, text, text.length);
}

export function insertTestOutreachDraft(
  db: TestDb,
  channelId: string,
  qualificationId: number,
  opts: { subject?: string; body?: string; isCurrent?: boolean } = {},
): number {
  const res = db
    .prepare(`
    INSERT INTO outreach_drafts (
      channel_id, qualification_id, language, subject, body,
      model_used, prompt_version, raw_response_path, is_current
    )
    VALUES (?, ?, 'it', ?, ?, 'test-model', 'v1', 'raw/test.json', ?)
  `)
    .run(
      channelId,
      qualificationId,
      opts.subject ?? 'Oggetto di test: collaborazione podcast',
      opts.body ?? 'Corpo della bozza di test. Siamo interessati a collaborare con il vostro canale per automatizzare la produzione.',
      opts.isCurrent !== false ? 1 : 0,
    );
  return Number(res.lastInsertRowid);
}
