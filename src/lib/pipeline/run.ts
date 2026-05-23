import { getDb } from '../db/client';
import { childLogger } from '../logger';
import { preflightChecks, InsufficientQuotaHeadroom } from './preflight';
import { openRun, closeRun } from './lifecycle';
import { runDiscovery, type DiscoveryStep } from './discovery/run';
import { runQualification } from './qualification/run';
import { QuotaExhausted } from '../youtube/quota';

type Db = ReturnType<typeof getDb>;

export type DiscoverySummary = Awaited<ReturnType<typeof runDiscovery>>;
export type QualificationSummary = Awaited<ReturnType<typeof runQualification>>;

export type RunPipelineOptions = {
  triggeredBy: 'cron' | 'manual';
  stages?: Array<'discovery' | 'videos' | 'qualification'>;
  qualificationLimit?: number;
};

const log = childLogger({ module: 'pipeline' });

export async function runPipeline(
  opts: RunPipelineOptions,
  db: Db = getDb(),
  onRunOpened?: (runId: number) => void,
): Promise<{
  runId?: number;
  status: 'completed' | 'cancelled';
  summary: {
    discovery?: DiscoverySummary;
    qualification?: QualificationSummary;
  };
}> {
  const { triggeredBy, stages, qualificationLimit } = opts;
  const runStages = stages ?? ['discovery', 'qualification'];
  const needsYoutubeQuota = runStages.includes('discovery') || runStages.includes('videos');

  try {
    await preflightChecks({ skipYoutubeCheck: !needsYoutubeQuota }, db);
  } catch (err) {
    if (err instanceof InsufficientQuotaHeadroom) {
      log.info({ spent: err.spent, required: err.required }, 'preflight failed, run cancelled');
      return { status: 'cancelled', summary: {} };
    }
    throw err;
  }

  const runId = await openRun(triggeredBy, db);
  onRunOpened?.(runId);
  const summary: { discovery?: DiscoverySummary; qualification?: QualificationSummary } = {};

  try {
    if (runStages.includes('discovery')) {
      summary.discovery = await runDiscovery(runId, {}, db);
      if (summary.discovery.cancelled) {
        await closeRun(runId, 'cancelled', 'quota exhausted during discovery', undefined, db);
        log.info({ runId, summary }, 'pipeline run cancelled due to quota exhaustion during discovery');
        return { runId, status: 'cancelled', summary };
      }
    } else if (runStages.includes('videos')) {
      const videoSteps: DiscoveryStep[] = ['filter', 'video-enrichment'];
      summary.discovery = await runDiscovery(runId, { steps: videoSteps }, db);
      if (summary.discovery.cancelled) {
        await closeRun(runId, 'cancelled', 'quota exhausted during video enrichment', undefined, db);
        log.info({ runId, summary }, 'pipeline run cancelled due to quota exhaustion during video enrichment');
        return { runId, status: 'cancelled', summary };
      }
    }

    if (runStages.includes('qualification')) {
      summary.qualification = await runQualification({ runId, limit: qualificationLimit }, db);
    }

    await closeRun(runId, 'completed', undefined, undefined, db);
    log.info({ runId, summary }, 'pipeline run completed');
    return { runId, status: 'completed', summary };
  } catch (err) {
    if (err instanceof QuotaExhausted) {
      await closeRun(runId, 'cancelled', err.message, undefined, db);
      log.info({ runId, spent: err.spent, cap: err.cap }, 'pipeline run cancelled due to quota exhaustion');
      return { runId, status: 'cancelled', summary };
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    await closeRun(runId, 'failed', message, stack, db);
    log.error({ runId, err }, 'pipeline run failed');
    throw err;
  }
}
