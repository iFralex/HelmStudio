import { eq, and, desc, asc, sql } from 'drizzle-orm';
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
export type OutreachStatus = Channel['outreachStatus'];

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
