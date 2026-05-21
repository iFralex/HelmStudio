import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { pipelineRuns } from '../db/schema';
import { childLogger } from '../logger';

type Db = ReturnType<typeof getDb>;

const log = childLogger({ module: 'lifecycle' });

export class ConcurrentRunError extends Error {
  constructor(public readonly runId: number) {
    super(`A pipeline run is already active (runId=${runId})`);
    this.name = 'ConcurrentRunError';
  }
}

export async function openRun(
  triggeredBy: 'cron' | 'manual',
  db: Db = getDb(),
): Promise<number> {
  return db.transaction((tx) => {
    const active = tx
      .select({ id: pipelineRuns.id })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.status, 'running'))
      .get();

    if (active) {
      throw new ConcurrentRunError(active.id);
    }

    const row = tx
      .insert(pipelineRuns)
      .values({ triggeredBy, status: 'running' })
      .returning({ id: pipelineRuns.id })
      .get();

    log.info({ runId: row.id, triggeredBy }, 'pipeline run opened');
    return row.id;
  });
}

export async function closeRun(
  runId: number,
  status: 'completed' | 'failed' | 'cancelled',
  errorMessage?: string,
  errorStack?: string,
  db: Db = getDb(),
): Promise<void> {
  let skipped = false;

  db.transaction((tx) => {
    const existing = tx
      .select({ status: pipelineRuns.status })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, runId))
      .get();

    if (!existing || existing.status !== 'running') {
      skipped = true;
      return;
    }

    tx.update(pipelineRuns)
      .set({
        status,
        finishedAt: new Date(),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        ...(errorStack !== undefined ? { errorStack } : {}),
      })
      .where(eq(pipelineRuns.id, runId))
      .run();
  });

  if (skipped) {
    log.warn({ runId }, 'closeRun called on non-running row, skipping');
    return;
  }

  log.info({ runId, status }, 'pipeline run closed');
}

export async function isRunActive(
  db: Db = getDb(),
): Promise<{ active: boolean; runId?: number }> {
  const row = db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.status, 'running'))
    .get();

  if (row) {
    return { active: true, runId: row.id };
  }
  return { active: false };
}
