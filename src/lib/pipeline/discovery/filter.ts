import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, pipelineRuns, pipelineEvents } from '../../db/schema';
import { getFilters } from '../../services/settings';
import { childLogger } from '../../logger';

type Db = ReturnType<typeof getDb>;

export async function applyPreQualificationFilter(
  args: { runId: number },
  db: Db = getDb(),
): Promise<{ rejected: number; surviving: number }> {
  const log = childLogger({ module: 'filter', runId: args.runId });

  const filters = await getFilters(db);

  const enrichedRows = db
    .select({
      id: channels.id,
      subscriberCount: channels.subscriberCount,
      country: channels.country,
      defaultLanguage: channels.defaultLanguage,
      videoCount: channels.videoCount,
    })
    .from(channels)
    .where(and(eq(channels.discoveryStatus, 'enriched'), isNull(channels.latestQualificationId)))
    .all();

  let rejected = 0;
  let surviving = 0;

  for (const row of enrichedRows) {
    let rejectionReason: string | null = null;

    if (row.subscriberCount === null) {
      rejectionReason = 'unknown_subscriber_count';
    } else if (row.subscriberCount < filters.minSubscribers) {
      rejectionReason = 'below_min_subscribers';
    } else if (row.subscriberCount > filters.maxSubscribers) {
      rejectionReason = 'above_max_subscribers';
    } else if (filters.country !== '' && row.country !== null && row.country !== filters.country) {
      rejectionReason = 'wrong_country';
    } else if (filters.language !== '' && row.defaultLanguage !== null && row.defaultLanguage !== filters.language) {
      rejectionReason = 'wrong_language';
    } else if ((row.videoCount ?? 0) < 20) {
      rejectionReason = 'too_few_videos';
    }

    if (rejectionReason !== null) {
      db.update(channels)
        .set({ discoveryStatus: 'rejected_pre_qual', rejectionReason })
        .where(eq(channels.id, row.id))
        .run();

      db.insert(pipelineEvents)
        .values({
          runId: args.runId,
          channelId: row.id,
          stage: 'filter',
          event: 'channel_pre_rejected',
          details: { reason: rejectionReason },
        })
        .run();

      rejected += 1;
    } else {
      surviving += 1;
    }
  }

  if (rejected > 0) {
    db.update(pipelineRuns)
      .set({ channelsPreRejected: sql`${pipelineRuns.channelsPreRejected} + ${rejected}` })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  log.info({ rejected, surviving }, 'pre-qualification filter complete');

  return { rejected, surviving };
}
