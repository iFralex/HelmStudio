import { inArray, sql, eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, pipelineRuns, pipelineEvents } from '../../db/schema';
import { getMostPopularByCategory } from '../../youtube/operations';
import { QuotaExhausted } from '../../youtube/quota';
import { IN_SCOPE_CATEGORY_IDS } from '../../seeds/categories';
import { childLogger } from '../../logger';

type Db = ReturnType<typeof getDb>;

export async function runCategoryExploration(
  args: { runId: number },
  db: Db = getDb(),
): Promise<{
  categoriesProcessed: number;
  candidatesInserted: number;
  candidatesAlreadyKnown: number;
}> {
  const log = childLogger({ module: 'category-exploration', runId: args.runId });

  let categoriesProcessed = 0;
  let candidatesInserted = 0;
  let candidatesAlreadyKnown = 0;
  let quotaExhausted: QuotaExhausted | null = null;

  for (const categoryId of IN_SCOPE_CATEGORY_IDS) {
    let result: Awaited<ReturnType<typeof getMostPopularByCategory>>;
    try {
      result = await getMostPopularByCategory({ categoryId, runId: args.runId }, db);
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ categoryId, spent: err.spent, cap: err.cap }, 'quota exhausted mid-category-exploration, stopping');
        quotaExhausted = err;
        break;
      }
      throw err;
    }

    categoriesProcessed += 1;

    const { channelIds } = result;
    let newCount = 0;
    let knownCount = 0;

    if (channelIds.length > 0) {
      const existingRows = db
        .select({ id: channels.id })
        .from(channels)
        .where(inArray(channels.id, channelIds))
        .all();
      const existingIds = new Set(existingRows.map((r) => r.id));

      const newIds = channelIds.filter((id) => !existingIds.has(id));
      newCount = newIds.length;
      knownCount = channelIds.length - newCount;

      if (newIds.length > 0) {
        db.insert(channels)
          .values(
            newIds.map((id) => ({
              id,
              title: id,
              discoveryStatus: 'candidate' as const,
              discoverySource: `category:${categoryId}`,
            })),
          )
          .onConflictDoNothing()
          .run();
      }
    }

    db.insert(pipelineEvents)
      .values({
        runId: args.runId,
        stage: 'discovery',
        event: 'discovery_category_complete',
        details: { categoryId, newCount, alreadyKnownCount: knownCount },
      })
      .run();

    candidatesInserted += newCount;
    candidatesAlreadyKnown += knownCount;

    log.info({ categoryId, newCount, knownCount }, 'category exploration done');
  }

  if (candidatesInserted > 0) {
    db.update(pipelineRuns)
      .set({
        candidatesFound: sql`${pipelineRuns.candidatesFound} + ${candidatesInserted}`,
      })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  if (quotaExhausted) throw quotaExhausted;

  return { categoriesProcessed, candidatesInserted, candidatesAlreadyKnown };
}
