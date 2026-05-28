import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

let sqlite3Available = true;
try {
  new Database(':memory:').close();
} catch {
  sqlite3Available = false;
}

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_BASE_URL: 'http://localhost:3456/v1',
    LLM_API_KEY: 'not-needed',
    LLM_MODEL_THINK: 'claude-test-think',
    LLM_MODEL_FAST: 'claude-test-fast',
    DATA_DIR: '/tmp/outreach-draft-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

const { mockCallLLM } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
}));

vi.mock('@/lib/llm/call', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/llm/call')>();
  return { ...mod, callLLM: mockCallLLM };
});

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../drizzle');

type Db = ReturnType<typeof drizzle<typeof schema>>;

function makeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

import {
  generateDraftForChannel,
  listDraftsForChannel,
  getCurrentDraft,
  addManualDraft,
  getDraftPrompt,
} from '@/lib/services/outreach';
import { findChannelByIdOrHandle, topChannelsWithoutEmail } from '@/lib/db/queries';
import { LlmFormatError } from '@/lib/llm/call';

const CHANNEL_ID = 'UC_outreach_test01';

function makeValidBody(): string {
  return Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
}

function makeShortBody(): string {
  return Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
}

function makeOverlyLongBody(): string {
  return Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
}

function makeDraftCallResult(body = makeValidBody(), subject = 'Test subject line here') {
  return {
    parsed: { subject, body },
    usage: { inputTokens: 100, outputTokens: 50 },
    latencyMs: 500,
    modelUsed: 'claude-test-fast',
    rawPath: `raw/llm/drafts/${CHANNEL_ID}/2024-01-01T00-00-00-000Z.json`,
  };
}

function insertFixtures(
  db: Db,
  opts?: { skipQualification?: boolean; pitchLanguage?: 'it' | 'en' },
): { qualId: number } {
  const { skipQualification = false, pitchLanguage = 'it' } = opts ?? {};

  db.insert(schema.channels)
    .values({ id: CHANNEL_ID, title: 'Test Channel', latestQualificationId: null })
    .run();

  if (skipQualification) return { qualId: 0 };

  const qualRow = db
    .insert(schema.qualifications)
    .values({
      channelId: CHANNEL_ID,
      modelUsed: 'claude-test-think',
      promptVersion: 'qualify-v1',
      rawResponsePath: 'raw/llm/qualifications/test.json',
      rawPromptPath: 'raw/llm/qualifications/test.json',
      pitchLanguage,
      automatableWorkflows: [
        {
          name: 'Script writing',
          description: 'Generate video scripts automatically',
          automationApproach: 'LLM-based generation',
          estimatedTimeSavedPerVideoMinutes: 60,
        },
      ],
      pitchAngle: 'Save time on script writing with AI',
      suggestedSolution: 'AI-powered script generator',
      signals: [
        { type: 'positive', evidence: 'Consistent structured format', videoId: 'vid0' },
        { type: 'negative', evidence: 'Manual filming required', videoId: null },
      ],
      nicheClassification: 'Tech',
      formatType: 'tutorial',
      automationPotentialScore: 75,
      disqualifiers: [],
      confidence: 0.8,
      rationale: 'Good automation potential.',
    })
    .returning({ id: schema.qualifications.id })
    .get()!;

  db.update(schema.channels)
    .set({ latestQualificationId: qualRow.id })
    .where(eq(schema.channels.id, CHANNEL_ID))
    .run();

  for (let i = 0; i < 5; i++) {
    db.insert(schema.videos)
      .values({
        id: `vid${i}`,
        channelId: CHANNEL_ID,
        title: `Video ${i}`,
        publishedAt: new Date(Date.now() - i * 86400000),
      })
      .run();
  }

  return { qualId: qualRow.id };
}

describe.skipIf(!sqlite3Available)('generateDraftForChannel', () => {
  let db: Db;

  beforeEach(() => {
    mockCallLLM.mockReset();
    db = makeDb();
  });

  it('inserts one draft row with isCurrent=true and rawResponsePath set', async () => {
    insertFixtures(db);
    const callResult = makeDraftCallResult();
    mockCallLLM.mockResolvedValue(callResult);

    const { draftId, subject, body, language } = await generateDraftForChannel(CHANNEL_ID, db);

    expect(draftId).toBeGreaterThan(0);
    expect(subject).toBe(callResult.parsed.subject);
    expect(body).toContain(callResult.parsed.body);
    expect(body.startsWith('Ciao')).toBe(true);
    expect(body).toContain('Martina Coluzzi');
    expect(body).toContain('helmstudio.it');
    expect(body).toContain('HELM Studio SRL');
    expect(language).toBe('it');

    const row = db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, draftId))
      .get();

    expect(row).toBeDefined();
    expect(row!.isCurrent).toBe(true);
    expect(row!.rawResponsePath).toBe(callResult.rawPath);
    expect(row!.channelId).toBe(CHANNEL_ID);
    expect(row!.inputTokens).toBe(100);
    expect(row!.outputTokens).toBe(50);
  });

  it('demotes previous current draft to isCurrent=false on regeneration', async () => {
    insertFixtures(db);
    mockCallLLM.mockResolvedValue(makeDraftCallResult());

    const { draftId: firstId } = await generateDraftForChannel(CHANNEL_ID, db);
    const { draftId: secondId } = await generateDraftForChannel(CHANNEL_ID, db);

    const firstRow = db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, firstId))
      .get();
    const secondRow = db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, secondId))
      .get();

    expect(firstRow!.isCurrent).toBe(false);
    expect(secondRow!.isCurrent).toBe(true);
  });

  it('throws a clear error when channel has no qualification', async () => {
    insertFixtures(db, { skipQualification: true });

    await expect(generateDraftForChannel(CHANNEL_ID, db)).rejects.toThrow(/no qualification/i);
  });

  it('throws when channel does not exist', async () => {
    await expect(generateDraftForChannel('non_existent_ch', db)).rejects.toThrow(
      /channel not found/i,
    );
  });

  it('retries once when body word count is too short and succeeds on retry', async () => {
    insertFixtures(db);
    const retryBody = makeValidBody();
    const retryRawPath = `raw/llm/drafts/${CHANNEL_ID}/2024-01-02T00-00-00-000Z.json`;

    mockCallLLM
      .mockResolvedValueOnce(makeDraftCallResult(makeShortBody()))
      .mockResolvedValueOnce({ ...makeDraftCallResult(retryBody), rawPath: retryRawPath });

    const { draftId } = await generateDraftForChannel(CHANNEL_ID, db);

    expect(draftId).toBeGreaterThan(0);
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
    expect(mockCallLLM).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ user: expect.stringContaining('Target ~180 words') }),
    );

    const row = db.select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, draftId)).get();
    expect(row!.body).toContain(retryBody);
    expect(row!.rawResponsePath).toBe(retryRawPath);
    expect(row!.inputTokens).toBe(200);
    expect(row!.outputTokens).toBe(100);
  });

  it('retries once when body word count is too long and succeeds on retry', async () => {
    insertFixtures(db);

    mockCallLLM
      .mockResolvedValueOnce(makeDraftCallResult(makeOverlyLongBody()))
      .mockResolvedValueOnce(makeDraftCallResult(makeValidBody()));

    const { draftId } = await generateDraftForChannel(CHANNEL_ID, db);

    expect(draftId).toBeGreaterThan(0);
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it('throws LlmFormatError when both attempts return a short body', async () => {
    insertFixtures(db);

    mockCallLLM.mockResolvedValue(makeDraftCallResult(makeShortBody()));

    await expect(generateDraftForChannel(CHANNEL_ID, db)).rejects.toThrow(LlmFormatError);
    expect(mockCallLLM).toHaveBeenCalledTimes(2);

    const rows = db.select().from(schema.outreachDrafts).all();
    expect(rows).toHaveLength(0);
  });

  it('uses pitchLanguage=en from qualification and returns correct language', async () => {
    insertFixtures(db, { pitchLanguage: 'en' });
    mockCallLLM.mockResolvedValue(makeDraftCallResult());

    const { language } = await generateDraftForChannel(CHANNEL_ID, db);

    expect(language).toBe('en');

    const rows = await listDraftsForChannel(CHANNEL_ID, db);
    expect(rows[0]!.language).toBe('en');
  });

  it('getCurrentDraft returns the active draft after generation', async () => {
    insertFixtures(db);
    mockCallLLM.mockResolvedValue(makeDraftCallResult());

    const { draftId } = await generateDraftForChannel(CHANNEL_ID, db);
    const current = await getCurrentDraft(CHANNEL_ID, db);

    expect(current).not.toBeNull();
    expect(current!.id).toBe(draftId);
    expect(current!.isCurrent).toBe(true);
  });

  it('getCurrentDraft returns null when no draft has been generated', async () => {
    insertFixtures(db);

    const current = await getCurrentDraft(CHANNEL_ID, db);

    expect(current).toBeNull();
  });

  it('listDraftsForChannel returns drafts newest first', async () => {
    insertFixtures(db);
    mockCallLLM.mockResolvedValue(makeDraftCallResult());

    const { draftId: firstId } = await generateDraftForChannel(CHANNEL_ID, db);
    const { draftId: secondId } = await generateDraftForChannel(CHANNEL_ID, db);

    const rows = await listDraftsForChannel(CHANNEL_ID, db);
    expect(rows[0]!.id).toBe(secondId);
    expect(rows[1]!.id).toBe(firstId);
  });
});

describe.skipIf(!sqlite3Available)('addManualDraft', () => {
  let db: Db;

  beforeEach(() => {
    mockCallLLM.mockReset();
    db = makeDb();
  });

  it('inserts a current draft without calling the LLM, assembling greeting and footer', async () => {
    insertFixtures(db);

    const { draftId } = await addManualDraft(
      { channelId: CHANNEL_ID, subject: 'Oggetto manuale', body: 'Corpo scritto a mano.', language: 'it' },
      db,
    );

    expect(draftId).toBeGreaterThan(0);
    expect(mockCallLLM).not.toHaveBeenCalled();

    const row = db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, draftId))
      .get();

    expect(row!.isCurrent).toBe(true);
    expect(row!.subject).toBe('Oggetto manuale');
    expect(row!.body.startsWith('Ciao,')).toBe(true);
    expect(row!.body).toContain('Corpo scritto a mano.');
    expect(row!.body).toContain('HELM Studio SRL');
    expect(row!.modelUsed).toBe('manual');
    expect(row!.promptVersion).toBe('manual');
    expect(row!.rawResponsePath).toBe('manual');
    expect(row!.qualificationId).not.toBeNull();
  });

  it('uses the recipient first name in the greeting when provided', async () => {
    insertFixtures(db);

    const { draftId } = await addManualDraft(
      {
        channelId: CHANNEL_ID,
        subject: 'Ciao',
        body: 'Testo.',
        language: 'it',
        recipientFirstName: 'Mario',
      },
      db,
    );

    const row = db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, draftId))
      .get();

    expect(row!.body.startsWith('Ciao Mario,')).toBe(true);
  });

  it('demotes the previous current draft', async () => {
    insertFixtures(db);

    const { draftId: firstId } = await addManualDraft(
      { channelId: CHANNEL_ID, subject: 'A', body: 'uno', language: 'it' },
      db,
    );
    const { draftId: secondId } = await addManualDraft(
      { channelId: CHANNEL_ID, subject: 'B', body: 'due', language: 'it' },
      db,
    );

    const first = db.select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, firstId)).get();
    const second = db.select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, secondId)).get();

    expect(first!.isCurrent).toBe(false);
    expect(second!.isCurrent).toBe(true);
  });

  it('works for a channel without a qualification (qualificationId null)', async () => {
    insertFixtures(db, { skipQualification: true });

    const { draftId } = await addManualDraft(
      { channelId: CHANNEL_ID, subject: 'No qual', body: 'testo', language: 'en' },
      db,
    );

    const row = db.select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, draftId)).get();
    expect(row!.qualificationId).toBeNull();
    expect(row!.language).toBe('en');
  });

  it('throws when the channel does not exist', async () => {
    await expect(
      addManualDraft({ channelId: 'nope', subject: 's', body: 'b', language: 'it' }, db),
    ).rejects.toThrow(/channel not found/i);
  });
});

describe.skipIf(!sqlite3Available)('getDraftPrompt', () => {
  let db: Db;

  beforeEach(() => {
    mockCallLLM.mockReset();
    db = makeDb();
  });

  it('returns system + user prompt without calling the LLM', async () => {
    insertFixtures(db);

    const { system, user, language } = await getDraftPrompt(CHANNEL_ID, db);

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(system.length).toBeGreaterThan(0);
    expect(user).toContain('Test Channel');
    expect(language).toBe('it');
  });

  it('throws when the channel has no qualification', async () => {
    insertFixtures(db, { skipQualification: true });

    await expect(getDraftPrompt(CHANNEL_ID, db)).rejects.toThrow(/no qualification/i);
  });

  it('throws when the channel does not exist', async () => {
    await expect(getDraftPrompt('non_existent_ch', db)).rejects.toThrow(/channel not found/i);
  });
});

describe.skipIf(!sqlite3Available)('topChannelsWithoutEmail', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  function insertChannel(
    id: string,
    score: number | null,
    email: string | null,
  ): void {
    db.insert(schema.channels)
      .values({ id, title: id, latestAutomationScore: score, email })
      .run();
  }

  it('returns scored channels without an email, ordered by score desc', async () => {
    insertChannel('UC_a', 90, null);
    insertChannel('UC_b', 50, null);
    insertChannel('UC_c', 70, null);

    const rows = await topChannelsWithoutEmail(10, db);

    expect(rows.map((r) => r.id)).toEqual(['UC_a', 'UC_c', 'UC_b']);
  });

  it('excludes channels that already have an email', async () => {
    insertChannel('UC_a', 90, 'a@example.com');
    insertChannel('UC_b', 50, null);

    const rows = await topChannelsWithoutEmail(10, db);

    expect(rows.map((r) => r.id)).toEqual(['UC_b']);
  });

  it('excludes channels with no score', async () => {
    insertChannel('UC_a', null, null);
    insertChannel('UC_b', 40, null);

    const rows = await topChannelsWithoutEmail(10, db);

    expect(rows.map((r) => r.id)).toEqual(['UC_b']);
  });

  it('honours the limit', async () => {
    insertChannel('UC_a', 90, null);
    insertChannel('UC_b', 80, null);
    insertChannel('UC_c', 70, null);

    const rows = await topChannelsWithoutEmail(2, db);

    expect(rows.map((r) => r.id)).toEqual(['UC_a', 'UC_b']);
  });
});

describe.skipIf(!sqlite3Available)('findChannelByIdOrHandle', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  it('finds a channel by id', async () => {
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'T', handle: '@mychannel' }).run();
    const found = await findChannelByIdOrHandle(CHANNEL_ID, db);
    expect(found!.id).toBe(CHANNEL_ID);
  });

  it('finds a channel by handle with the @ prefix', async () => {
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'T', handle: '@mychannel' }).run();
    const found = await findChannelByIdOrHandle('@mychannel', db);
    expect(found!.id).toBe(CHANNEL_ID);
  });

  it('finds a channel by handle without the @ prefix', async () => {
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'T', handle: '@mychannel' }).run();
    const found = await findChannelByIdOrHandle('mychannel', db);
    expect(found!.id).toBe(CHANNEL_ID);
  });

  it('matches a handle stored without @ regardless of the @ in the query', async () => {
    db.insert(schema.channels).values({ id: CHANNEL_ID, title: 'T', handle: 'mychannel' }).run();
    expect((await findChannelByIdOrHandle('mychannel', db))!.id).toBe(CHANNEL_ID);
    expect((await findChannelByIdOrHandle('@mychannel', db))!.id).toBe(CHANNEL_ID);
  });

  it('returns null when nothing matches', async () => {
    const found = await findChannelByIdOrHandle('unknown', db);
    expect(found).toBeNull();
  });
});
