import { eq, and, isNull, count } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, pipelineRuns } from '../../db/schema';
import { getPipelineConfig } from '../../services/settings';
import { QuotaExhausted } from '../../youtube/quota';
import { childLogger } from '../../logger';
import { runKeywordSweep } from './keyword-sweep';
import { runCategoryExploration } from './category-exploration';
import { enrichCandidateChannels } from './enrichment';
import { applyPreQualificationFilter } from './filter';
import { fetchVideosForSurvivingChannels } from './video-enrichment';

type Db = ReturnType<typeof getDb>;

export async function runDiscovery(
  runId: number,
  db: Db = getDb(),
): Promise<{
  searchesPerformed: number;
  candidatesFound: number;
  channelsEnriched: number;
  channelsPreRejected: number;
  channelsReadyForQualification: number;
}> {
  const log = childLogger({ module: 'discovery', runId });
  const config = await getPipelineConfig(db);
  let cancelled = false;

  const runStep = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    if (cancelled) return null;
    try {
      return await fn();
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ step: name, spent: err.spent, cap: err.cap }, 'quota exhausted, cancelling run');
        cancelled = true;
        return null;
      }
      throw err;
    }
  };

  try {
    await runStep('keyword-sweep', () =>
      runKeywordSweep({ runId, keywordCount: config.keywordsPerRun }, db),
    );

    await runStep('category-exploration', () => runCategoryExploration({ runId }, db));

    await runStep('enrichment', () => enrichCandidateChannels({ runId }, db));

    await runStep('filter', () => applyPreQualificationFilter({ runId }, db));

    await runStep('video-enrichment', () =>
      fetchVideosForSurvivingChannels({ runId, limit: config.targetQualifiedPerRun }, db),
    );
  } catch (err) {
    db.update(pipelineRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(pipelineRuns.id, runId))
      .run();
    throw err;
  }

  const finishedAt = new Date();
  db.update(pipelineRuns)
    .set(cancelled ? { status: 'cancelled', finishedAt } : { status: 'completed', finishedAt })
    .where(eq(pipelineRuns.id, runId))
    .run();

  const run = db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).get();

  const channelsReadyForQualification =
    db
      .select({ value: count() })
      .from(channels)
      .where(and(eq(channels.discoveryStatus, 'enriched'), isNull(channels.latestQualificationId)))
      .get()?.value ?? 0;

  const summary = {
    searchesPerformed: run?.searchesPerformed ?? 0,
    candidatesFound: run?.candidatesFound ?? 0,
    channelsEnriched: run?.channelsEnriched ?? 0,
    channelsPreRejected: run?.channelsPreRejected ?? 0,
    channelsReadyForQualification,
  };

  log.info({ ...summary, cancelled }, 'discovery pipeline complete');

  return summary;
}
