import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { quotaLedger } from '../db/schema';
import { env } from '../env';

type Db = ReturnType<typeof getDb>;

export type YoutubeOperation =
  | 'search.list'
  | 'channels.list'
  | 'playlistItems.list'
  | 'videos.list';

export const OPERATION_COSTS: Record<YoutubeOperation, number> = {
  'search.list': 100,
  'channels.list': 1,
  'playlistItems.list': 1,
  'videos.list': 1,
};

export class QuotaExhausted extends Error {
  constructor(
    public readonly spent: number,
    public readonly cap: number,
  ) {
    super(`YouTube quota exhausted: ${spent}/${cap} units used today`);
    this.name = 'QuotaExhausted';
  }
}

export function pacificDateString(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

export async function todayUnitsSpent(db: Db = getDb()): Promise<number> {
  const today = pacificDateString();
  const row = db
    .select({ total: sql<number>`coalesce(sum(${quotaLedger.units}), 0)` })
    .from(quotaLedger)
    .where(eq(quotaLedger.date, today))
    .get();
  return row?.total ?? 0;
}

export async function assertHeadroom(
  operation: YoutubeOperation,
  runId?: number,
  db: Db = getDb(),
): Promise<void> {
  const spent = await todayUnitsSpent(db);
  const cost = OPERATION_COSTS[operation];
  const cap = env.PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - env.PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER;
  if (spent + cost > cap) {
    throw new QuotaExhausted(spent, cap);
  }
}

export async function recordQuotaUse(
  operation: YoutubeOperation,
  runId?: number,
  db: Db = getDb(),
): Promise<void> {
  const today = pacificDateString();
  db.insert(quotaLedger)
    .values({
      date: today,
      operation,
      units: OPERATION_COSTS[operation],
      runId: runId ?? null,
    })
    .run();
}

export function checkAndRecordQuota(
  operation: YoutubeOperation,
  runId?: number,
  db: Db = getDb(),
): void {
  const today = pacificDateString();
  const cost = OPERATION_COSTS[operation];
  const cap = env.PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - env.PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER;
  db.transaction((tx) => {
    const row = tx
      .select({ total: sql<number>`coalesce(sum(${quotaLedger.units}), 0)` })
      .from(quotaLedger)
      .where(eq(quotaLedger.date, today))
      .get();
    const spent = row?.total ?? 0;
    if (spent + cost > cap) throw new QuotaExhausted(spent, cap);
    tx.insert(quotaLedger)
      .values({ date: today, operation, units: cost, runId: runId ?? null })
      .run();
  });
}
