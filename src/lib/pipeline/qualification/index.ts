import { count, eq, sum } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { pipelineRuns, qualifications, videoSelections } from '@/lib/db/schema';
import { childLogger } from '@/lib/logger';
import { qualifyChannel } from './qualify-channel';

type Db = ReturnType<typeof getDb>;

export type QualificationResult = {
  status: 'qualified' | 'skipped' | 'rejected_post_qual';
  reason?: string;
  qualificationId?: number;
  runId: number;
};

export async function forceRequalifyChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<QualificationResult> {
  const log = childLogger({ module: 'qualification', channelId });

  const runRow = db
    .insert(pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: pipelineRuns.id })
    .get();
  const runId = runRow.id;

  log.info({ runId }, 'force re-qualify started');

  try {
    const result = await qualifyChannel({ channelId, runId, force: true }, db);

    const selectionStats = db
      .select({
        calls: count(),
        tokensIn: sum(videoSelections.inputTokens),
        tokensOut: sum(videoSelections.outputTokens),
      })
      .from(videoSelections)
      .where(eq(videoSelections.runId, runId))
      .get();

    const qualStats = db
      .select({
        calls: count(),
        tokensIn: sum(qualifications.inputTokens),
        tokensOut: sum(qualifications.outputTokens),
      })
      .from(qualifications)
      .where(eq(qualifications.runId, runId))
      .get();

    const llmCallsCount = (selectionStats?.calls ?? 0) + (qualStats?.calls ?? 0);
    const llmTokensInput =
      Number(selectionStats?.tokensIn ?? 0) + Number(qualStats?.tokensIn ?? 0);
    const llmTokensOutput =
      Number(selectionStats?.tokensOut ?? 0) + Number(qualStats?.tokensOut ?? 0);

    db.update(pipelineRuns)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        channelsQualified: result.status === 'qualified' ? 1 : 0,
        channelsPostRejected: result.status === 'rejected_post_qual' ? 1 : 0,
        llmCallsCount,
        llmTokensInput,
        llmTokensOutput,
      })
      .where(eq(pipelineRuns.id, runId))
      .run();

    log.info({ runId, status: result.status }, 'force re-qualify complete');

    return { ...result, runId };
  } catch (err) {
    db.update(pipelineRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
      })
      .where(eq(pipelineRuns.id, runId))
      .run();

    throw err;
  }
}
