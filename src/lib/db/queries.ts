import { eq, and, desc, asc, sql, gte, lte, lt, inArray, or } from 'drizzle-orm';
export type { OutreachStatus, ListChannelsFilters } from './constants';
export { ALL_OUTREACH_STATUSES } from './constants';
import { ALL_OUTREACH_STATUSES } from './constants';
import type { OutreachStatus, ListChannelsFilters } from './constants';
import type { SQL } from 'drizzle-orm';
import {
  channels,
  videos,
  videoSelections,
  transcripts,
  qualifications,
  outreachDrafts,
  pipelineRuns,
  pipelineEvents,
  quotaLedger,
  seedKeywords,
  settings,
} from './schema';
import { getDb } from './client';
import { quotaSummary } from '../youtube/dashboard';

export type Channel = typeof channels.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type VideoSelection = typeof videoSelections.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type Qualification = typeof qualifications.$inferSelect;
export type OutreachDraft = typeof outreachDrafts.$inferSelect;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type PipelineEvent = typeof pipelineEvents.$inferSelect;
export type QuotaLedgerEntry = typeof quotaLedger.$inferSelect;
export type SeedKeyword = typeof seedKeywords.$inferSelect;
export type Setting = typeof settings.$inferSelect;

export type DiscoveryStatus = Channel['discoveryStatus'];

export interface ListChannelsOpts {
  discoveryStatus?: DiscoveryStatus;
  outreachStatus?: OutreachStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'discoveredAt' | 'latestAutomationScore';
  order?: 'asc' | 'desc';
}

type Db = ReturnType<typeof getDb>;

export async function getChannelById(id: string, db: Db = getDb()): Promise<Channel | null> {
  return db.select().from(channels).where(eq(channels.id, id)).get() ?? null;
}

export async function listChannels(
  opts: ListChannelsOpts = {},
  db: Db = getDb(),
): Promise<Channel[]> {
  const {
    discoveryStatus,
    outreachStatus,
    limit = 50,
    offset = 0,
    orderBy = 'discoveredAt',
    order = 'desc',
  } = opts;

  const col =
    orderBy === 'latestAutomationScore'
      ? channels.latestAutomationScore
      : channels.discoveredAt;
  const dir = order === 'asc' ? asc(col) : desc(col);

  const conditions: SQL<unknown>[] = [];
  if (discoveryStatus) conditions.push(eq(channels.discoveryStatus, discoveryStatus));
  if (outreachStatus) conditions.push(eq(channels.outreachStatus, outreachStatus));

  return db
    .select()
    .from(channels)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(dir)
    .limit(limit)
    .offset(offset)
    .all();
}

const ALL_DISCOVERY_STATUSES: DiscoveryStatus[] = [
  'candidate',
  'enriched',
  'rejected_pre_qual',
  'qualified',
  'rejected_post_qual',
];

export async function countChannelsByStatus(
  db: Db = getDb(),
): Promise<Record<DiscoveryStatus, number>> {
  const rows = db
    .select({ status: channels.discoveryStatus, count: sql<number>`count(*)` })
    .from(channels)
    .groupBy(channels.discoveryStatus)
    .all();

  const base = Object.fromEntries(ALL_DISCOVERY_STATUSES.map((s) => [s, 0])) as Record<
    DiscoveryStatus,
    number
  >;
  for (const r of rows) base[r.status] = r.count;
  return base;
}

export async function getQualificationById(
  id: number,
  db: Db = getDb(),
): Promise<Qualification | null> {
  return db.select().from(qualifications).where(eq(qualifications.id, id)).get() ?? null;
}

export async function getLatestQualification(
  channelId: string,
  db: Db = getDb(),
): Promise<Qualification | null> {
  return (
    db
      .select()
      .from(qualifications)
      .where(eq(qualifications.channelId, channelId))
      .orderBy(desc(qualifications.createdAt))
      .limit(1)
      .get() ?? null
  );
}

export async function getVideoSelectionByQualificationId(
  qualificationId: number,
  db: Db = getDb(),
): Promise<VideoSelection | null> {
  const qual = db
    .select({ videoSelectionId: qualifications.videoSelectionId })
    .from(qualifications)
    .where(eq(qualifications.id, qualificationId))
    .get();

  if (!qual?.videoSelectionId) return null;

  return (
    db
      .select()
      .from(videoSelections)
      .where(eq(videoSelections.id, qual.videoSelectionId))
      .get() ?? null
  );
}

export async function listTranscriptsForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<Transcript[]> {
  return db
    .select()
    .from(transcripts)
    .where(eq(transcripts.channelId, channelId))
    .orderBy(desc(transcripts.fetchedAt))
    .all();
}

export async function getCurrentDraft(
  channelId: string,
  db: Db = getDb(),
): Promise<OutreachDraft | null> {
  return (
    db
      .select()
      .from(outreachDrafts)
      .where(
        and(eq(outreachDrafts.channelId, channelId), eq(outreachDrafts.isCurrent, true)),
      )
      .get() ?? null
  );
}

export async function getLatestRun(db: Db = getDb()): Promise<PipelineRun | null> {
  return (
    db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.startedAt)).limit(1).get() ?? null
  );
}

export async function listRuns(
  opts?: { limit?: number; before?: number },
  db: Db = getDb(),
): Promise<PipelineRun[]> {
  const { limit = 50, before } = opts ?? {};
  return db
    .select()
    .from(pipelineRuns)
    .where(before !== undefined ? lt(pipelineRuns.startedAt, new Date(before)) : undefined)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit)
    .all();
}

export async function getRunById(id: number, db: Db = getDb()): Promise<PipelineRun | null> {
  return db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).get() ?? null;
}

export async function listEventsForRun(
  runId: number,
  opts?: { channelId?: string; stage?: string },
  db: Db = getDb(),
): Promise<Array<PipelineEvent & { channelTitle: string | null }>> {
  const { channelId, stage } = opts ?? {};
  const conditions: SQL<unknown>[] = [eq(pipelineEvents.runId, runId)];
  if (channelId) conditions.push(eq(pipelineEvents.channelId, channelId));
  if (stage) conditions.push(eq(pipelineEvents.stage, stage as PipelineEvent['stage']));

  const rows = db
    .select()
    .from(pipelineEvents)
    .leftJoin(channels, eq(pipelineEvents.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(asc(pipelineEvents.createdAt))
    .all();

  return rows.map((r) => ({
    ...r.pipeline_events,
    channelTitle: r.channels?.title ?? null,
  }));
}

export async function todayQuotaUsed(db: Db = getDb()): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .select({ total: sql<number>`coalesce(sum(${quotaLedger.units}), 0)` })
    .from(quotaLedger)
    .where(eq(quotaLedger.date, today))
    .get();
  return row?.total ?? 0;
}

export async function getSetting<T = unknown>(key: string, db: Db = getDb()): Promise<T | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  return row.value as T;
}

export async function setSetting(
  key: string,
  value: unknown,
  db: Db = getDb(),
): Promise<void> {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(unixepoch())` },
    })
    .run();
}


function escapeLike(s: string): string {
  return s.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

export async function listChannelsForUi(
  filters: ListChannelsFilters = {},
  db: Db = getDb(),
): Promise<{
  rows: Array<Channel & { latestQualification: Qualification | null }>;
  totalCount: number;
  page: number;
  pageSize: number;
}> {
  const {
    outreachStatus: outreachStatusFilter,
    minScore,
    maxScore,
    minSubs,
    maxSubs,
    nicheContains,
    formatContains,
    pitchLanguage,
    search,
    sort = 'score_desc',
    page = 1,
    pageSize = 50,
  } = filters;

  const conditions: SQL<unknown>[] = [];

  if (outreachStatusFilter && outreachStatusFilter.length > 0) {
    conditions.push(inArray(channels.outreachStatus, outreachStatusFilter));
  }
  if (minScore !== undefined) {
    conditions.push(gte(channels.latestAutomationScore, minScore));
  }
  if (maxScore !== undefined) {
    conditions.push(lte(channels.latestAutomationScore, maxScore));
  }
  if (minSubs !== undefined) {
    conditions.push(gte(channels.subscriberCount, minSubs));
  }
  if (maxSubs !== undefined) {
    conditions.push(lte(channels.subscriberCount, maxSubs));
  }
  if (nicheContains) {
    const pat = `%${escapeLike(nicheContains)}%`;
    conditions.push(sql`${qualifications.nicheClassification} LIKE ${pat} ESCAPE '!'`);
  }
  if (formatContains) {
    const pat = `%${escapeLike(formatContains)}%`;
    conditions.push(sql`${qualifications.formatType} LIKE ${pat} ESCAPE '!'`);
  }
  if (pitchLanguage) {
    conditions.push(eq(qualifications.pitchLanguage, pitchLanguage));
  }
  if (search) {
    const pat = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        sql`${channels.title} LIKE ${pat} ESCAPE '!'`,
        sql`${channels.handle} LIKE ${pat} ESCAPE '!'`,
        sql`${channels.description} LIKE ${pat} ESCAPE '!'`,
      )!,
    );
  }

  const orderByCol =
    sort === 'score_desc'
      ? desc(channels.latestAutomationScore)
      : sort === 'subs_desc'
        ? desc(channels.subscriberCount)
        : sort === 'qualified_at_desc'
          ? desc(channels.lastQualifiedAt)
          : desc(channels.discoveredAt);

  const offset = (page - 1) * pageSize;
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(channels)
      .leftJoin(qualifications, eq(channels.latestQualificationId, qualifications.id))
      .where(whereClause)
      .orderBy(orderByCol)
      .limit(pageSize)
      .offset(offset)
      .all(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(channels)
      .leftJoin(qualifications, eq(channels.latestQualificationId, qualifications.id))
      .where(whereClause)
      .get(),
  ]);

  return {
    rows: rows.map((r) => ({ ...r.channels, latestQualification: r.qualifications ?? null })),
    totalCount: countRow?.count ?? 0,
    page,
    pageSize,
  };
}

export async function todayLlmStats(db: Db = getDb()): Promise<{
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartSec = Math.floor(todayStart.getTime() / 1000);

  const row = db
    .select({
      callsCount: sql<number>`coalesce(sum(${pipelineRuns.llmCallsCount}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${pipelineRuns.llmTokensInput}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${pipelineRuns.llmTokensOutput}), 0)`,
    })
    .from(pipelineRuns)
    .where(gte(pipelineRuns.startedAt, new Date(todayStartSec * 1000)))
    .get();

  return {
    callsCount: row?.callsCount ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  };
}


export async function getChannelDetail(
  channelId: string,
  db: Db = getDb(),
): Promise<{
  channel: Channel;
  videos: Video[];
  qualification: Qualification | null;
  videoSelection: VideoSelection | null;
  transcriptsByVideo: Record<string, Transcript | null>;
  currentDraft: OutreachDraft | null;
  draftHistory: OutreachDraft[];
} | null> {
  const channel = await getChannelById(channelId, db);
  if (!channel) return null;

  const [videoRows, qualification, currentDraft, allDrafts] = await Promise.all([
    db
      .select()
      .from(videos)
      .where(eq(videos.channelId, channelId))
      .orderBy(desc(videos.publishedAt))
      .limit(20)
      .all(),
    getLatestQualification(channelId, db),
    getCurrentDraft(channelId, db),
    db
      .select()
      .from(outreachDrafts)
      .where(eq(outreachDrafts.channelId, channelId))
      .orderBy(desc(outreachDrafts.createdAt))
      .all(),
  ]);

  let videoSelection: VideoSelection | null = null;
  if (qualification?.videoSelectionId) {
    videoSelection =
      db
        .select()
        .from(videoSelections)
        .where(eq(videoSelections.id, qualification.videoSelectionId))
        .get() ?? null;
  }

  const videoIds = videoRows.map((v) => v.id);
  const transcriptRows =
    videoIds.length > 0
      ? db.select().from(transcripts).where(inArray(transcripts.videoId, videoIds)).all()
      : [];

  const transcriptsByVideo: Record<string, Transcript | null> = Object.fromEntries(
    videoIds.map((id) => [id, null]),
  );
  for (const t of transcriptRows) {
    transcriptsByVideo[t.videoId] = t;
  }

  const draftHistory = allDrafts.filter((d) => !d.isCurrent);

  return {
    channel,
    videos: videoRows,
    qualification,
    videoSelection,
    transcriptsByVideo,
    currentDraft,
    draftHistory,
  };
}

export async function listKeywords(db: Db = getDb()): Promise<SeedKeyword[]> {
  return db
    .select()
    .from(seedKeywords)
    .orderBy(desc(seedKeywords.isActive), asc(seedKeywords.lastUsedAt))
    .all();
}

export class KeywordAlreadyExists extends Error {
  constructor(keyword: string) {
    super(`Keyword already exists: ${keyword}`);
    this.name = 'KeywordAlreadyExists';
  }
}

export async function createKeyword(
  input: { keyword: string; notes?: string },
  db: Db = getDb(),
): Promise<SeedKeyword> {
  const trimmed = input.keyword.trim();
  try {
    const row = await db
      .insert(seedKeywords)
      .values({ keyword: trimmed, notes: input.notes ?? null })
      .returning()
      .get();
    return row!;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new KeywordAlreadyExists(trimmed);
    }
    throw err;
  }
}

export async function updateKeyword(
  id: number,
  patch: Partial<Pick<SeedKeyword, 'isActive' | 'notes'>>,
  db: Db = getDb(),
): Promise<void> {
  await db.update(seedKeywords).set(patch).where(eq(seedKeywords.id, id)).run();
}

export async function deleteKeyword(id: number, db: Db = getDb()): Promise<void> {
  await db.delete(seedKeywords).where(eq(seedKeywords.id, id)).run();
}

export async function dashboardSnapshot(db: Db = getDb()): Promise<{
  latestRun: PipelineRun | null;
  queues: Record<DiscoveryStatus | OutreachStatus, number>;
  topRecent: Array<{
    channelId: string;
    title: string;
    handle: string | null;
    thumbnailUrl: string | null;
    score: number;
    nicheClassification: string;
  }>;
  quota: Awaited<ReturnType<typeof quotaSummary>>;
}> {
  const [latestRun, discoveryRows, outreachRows, topRecentRows, quota] = await Promise.all([
    getLatestRun(db),
    db
      .select({ status: channels.discoveryStatus, count: sql<number>`count(*)` })
      .from(channels)
      .groupBy(channels.discoveryStatus)
      .all(),
    db
      .select({ status: channels.outreachStatus, count: sql<number>`count(*)` })
      .from(channels)
      .groupBy(channels.outreachStatus)
      .all(),
    db
      .select({
        channelId: channels.id,
        title: channels.title,
        handle: channels.handle,
        thumbnailUrl: channels.thumbnailUrl,
        score: channels.latestAutomationScore,
        nicheClassification: qualifications.nicheClassification,
      })
      .from(channels)
      .leftJoin(qualifications, eq(channels.latestQualificationId, qualifications.id))
      .where(eq(channels.discoveryStatus, 'qualified'))
      .orderBy(desc(channels.lastQualifiedAt))
      .limit(10)
      .all(),
    quotaSummary(db),
  ]);

  const queues = Object.fromEntries([
    ...ALL_DISCOVERY_STATUSES.map((s) => [s, 0]),
    ...ALL_OUTREACH_STATUSES.map((s) => [s, 0]),
  ]) as Record<DiscoveryStatus | OutreachStatus, number>;

  for (const r of discoveryRows) queues[r.status as DiscoveryStatus] = r.count;
  for (const r of outreachRows) queues[r.status as OutreachStatus] = r.count;

  const topRecent = topRecentRows.map((r) => ({
    channelId: r.channelId,
    title: r.title,
    handle: r.handle,
    thumbnailUrl: r.thumbnailUrl,
    score: r.score ?? 0,
    nicheClassification: r.nicheClassification ?? '',
  }));

  return { latestRun, queues, topRecent, quota };
}
