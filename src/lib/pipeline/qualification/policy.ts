import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { channels, videos } from '@/lib/db/schema';
import { getFilters } from '@/lib/services/settings';

type Db = ReturnType<typeof getDb>;

export type RequalifyDecision =
  | { skip: true; reason: 'within_window' | 'no_videos' | 'wrong_status' }
  | { skip: false };

export async function shouldQualify(
  channelId: string,
  opts?: { force?: boolean },
  db: Db = getDb(),
): Promise<RequalifyDecision> {
  const force = opts?.force ?? false;

  const channel = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) return { skip: true, reason: 'wrong_status' };

  if (channel.discoveryStatus !== 'enriched' && channel.discoveryStatus !== 'qualified') {
    return { skip: true, reason: 'wrong_status' };
  }

  if (!force && channel.lastQualifiedAt !== null) {
    const filters = await getFilters(db);
    const windowMs = filters.requalifyAfterDays * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - channel.lastQualifiedAt.getTime();
    if (elapsed < windowMs) {
      return { skip: true, reason: 'within_window' };
    }
  }

  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .get();

  if (!row || row.count === 0) {
    return { skip: true, reason: 'no_videos' };
  }

  return { skip: false };
}
