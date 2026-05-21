import { eq, sum, count, desc } from 'drizzle-orm';
import pLimit from 'p-limit';
import { getDb } from '@/lib/db/client';
import { channels, pipelineRuns, qualifications, videoSelections } from '@/lib/db/schema';
import { childLogger } from '@/lib/logger';
import { qualifyChannel } from './qualify-channel';

type Db = ReturnType<typeof getDb>;

export async function runQualification(
  args: { runId: number },
  db: Db = getDb(),
): Promise<{ qualified: number; skipped: number; rejected: number }> {
  const { runId } = args;
  const log = childLogger({ module: 'qualification', runId });

  const enrichedChannels = db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.discoveryStatus, 'enriched'))
    .orderBy(desc(channels.discoveredAt))
    .all();

  log.info({ total: enrichedChannels.length }, 'starting qualification batch');

  const limit = pLimit(3);
  let qualified = 0;
  let skipped = 0;
  let rejected = 0;

  await Promise.all(
    enrichedChannels.map(({ id: channelId }) =>
      limit(async () => {
        try {
          const result = await qualifyChannel({ channelId, runId }, db);
          if (result.status === 'qualified') qualified++;
          else if (result.status === 'skipped') skipped++;
          else if (result.status === 'rejected_post_qual') rejected++;
        } catch (err) {
          log.error({ channelId, err }, 'unexpected error qualifying channel');
          rejected++;
        }
      }),
    ),
  );

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
    .set({ channelsQualified: qualified, channelsPostRejected: rejected, llmCallsCount, llmTokensInput, llmTokensOutput })
    .where(eq(pipelineRuns.id, runId))
    .run();

  log.info({ qualified, skipped, rejected, llmCallsCount, llmTokensInput, llmTokensOutput }, 'qualification batch complete');

  return { qualified, skipped, rejected };
}
