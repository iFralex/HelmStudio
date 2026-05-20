import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { quotaLedger } from '../db/schema';
import { env } from '../env';
import {
  OPERATION_COSTS,
  pacificDateString,
  YoutubeOperation,
} from './quota';

type Db = ReturnType<typeof getDb>;

export async function quotaSummary(db: Db = getDb()): Promise<{
  date: string;
  spent: number;
  cap: number;
  safetyBuffer: number;
  remaining: number;
  byOperation: Record<YoutubeOperation, number>;
}> {
  const date = pacificDateString();
  const dailyLimit = env.PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT;
  const safetyBuffer = env.PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER;
  const cap = dailyLimit - safetyBuffer;

  const rows = db
    .select({
      operation: quotaLedger.operation,
      total: sql<number>`coalesce(sum(${quotaLedger.units}), 0)`,
    })
    .from(quotaLedger)
    .where(eq(quotaLedger.date, date))
    .groupBy(quotaLedger.operation)
    .all();

  const byOperation = Object.fromEntries(
    Object.keys(OPERATION_COSTS).map((op) => [op, 0]),
  ) as Record<YoutubeOperation, number>;

  let spent = 0;
  for (const row of rows) {
    const op = row.operation as YoutubeOperation;
    if (op in byOperation) {
      byOperation[op] = row.total;
    }
    spent += row.total;
  }

  return {
    date,
    spent,
    cap,
    safetyBuffer,
    remaining: Math.max(0, cap - spent),
    byOperation,
  };
}
