import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, pipelineRuns, pipelineEvents } from '../../db/schema';
import { getChannels, chunk } from '../../youtube/operations';
import { QuotaExhausted } from '../../youtube/quota';
import { childLogger } from '../../logger';

type Db = ReturnType<typeof getDb>;

export async function enrichCandidateChannels(
  args: { runId: number },
  db: Db = getDb(),
): Promise<{ enrichedCount: number; failedCount: number }> {
  const log = childLogger({ module: 'enrichment', runId: args.runId });

  const candidateRows = db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.discoveryStatus, 'candidate'), isNull(channels.lastFetchedAt)))
    .all();

  if (candidateRows.length === 0) {
    log.info('no candidates to enrich');
    return { enrichedCount: 0, failedCount: 0 };
  }

  const candidateIds = candidateRows.map((r) => r.id);
  const batches = chunk(candidateIds, 50);
  let enrichedCount = 0;
  let failedCount = 0;
  let quotaExhausted: QuotaExhausted | null = null;

  for (const batch of batches) {
    let result: Awaited<ReturnType<typeof getChannels>>;
    try {
      result = await getChannels({ ids: batch, runId: args.runId }, db);
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ spent: err.spent, cap: err.cap }, 'quota exhausted mid-enrichment, stopping');
        quotaExhausted = err;
        break;
      }
      throw err;
    }

    const { channels: channelDetails, rawPaths } = result;
    const foundIds = new Set(channelDetails.map((c) => c.id));
    const missingIds = batch.filter((id) => !foundIds.has(id));

    const now = new Date();
    for (const detail of channelDetails) {
      db.update(channels)
        .set({
          title: detail.title,
          handle: detail.handle,
          description: detail.description,
          country: detail.country,
          defaultLanguage: detail.defaultLanguage,
          customUrl: detail.customUrl,
          subscriberCount: detail.subscriberCount,
          viewCount: detail.viewCount,
          videoCount: detail.videoCount,
          uploadsPlaylistId: detail.uploadsPlaylistId,
          thumbnailUrl: detail.thumbnailUrl,
          channelPublishedAt: detail.channelPublishedAt,
          rawMetaPath: rawPaths[detail.id] ?? null,
          lastFetchedAt: now,
          discoveryStatus: 'enriched',
        })
        .where(eq(channels.id, detail.id))
        .run();
      enrichedCount += 1;
    }

    for (const id of missingIds) {
      db.update(channels)
        .set({ discoveryStatus: 'rejected_pre_qual', rejectionReason: 'not_found' })
        .where(eq(channels.id, id))
        .run();
      failedCount += 1;
    }

    db.insert(pipelineEvents)
      .values({
        runId: args.runId,
        stage: 'enrichment',
        event: 'enrichment_batch_complete',
        details: {
          batchSize: batch.length,
          enriched: channelDetails.length,
          missing: missingIds.length,
        },
      })
      .run();

    log.info(
      { batchSize: batch.length, enriched: channelDetails.length, missing: missingIds.length },
      'enrichment batch done',
    );
  }

  if (enrichedCount > 0) {
    db.update(pipelineRuns)
      .set({ channelsEnriched: sql`${pipelineRuns.channelsEnriched} + ${enrichedCount}` })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  if (quotaExhausted) throw quotaExhausted;

  return { enrichedCount, failedCount };
}
