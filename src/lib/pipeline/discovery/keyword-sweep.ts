import { eq, asc, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, seedKeywords, pipelineRuns, pipelineEvents } from '../../db/schema';
import { searchChannels } from '../../youtube/operations';
import { QuotaExhausted } from '../../youtube/quota';
import { childLogger } from '../../logger';

type Db = ReturnType<typeof getDb>;

export async function runKeywordSweep(
  args: {
    runId: number;
    keywordCount: number;
  },
  db: Db = getDb(),
): Promise<{
  searchesPerformed: number;
  candidatesInserted: number;
  candidatesAlreadyKnown: number;
}> {
  const log = childLogger({ module: 'keyword-sweep', runId: args.runId });

  // SQLite ASC puts NULLs first, so never-used keywords are selected first
  const keywords = db
    .select()
    .from(seedKeywords)
    .where(eq(seedKeywords.isActive, true))
    .orderBy(asc(seedKeywords.lastUsedAt))
    .limit(args.keywordCount)
    .all();

  let searchesPerformed = 0;
  let candidatesInserted = 0;
  let candidatesAlreadyKnown = 0;
  let quotaExhausted: QuotaExhausted | null = null;

  for (const kw of keywords) {
    let searchResult: Awaited<ReturnType<typeof searchChannels>>;
    try {
      searchResult = await searchChannels({ query: kw.keyword, runId: args.runId }, db);
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ keyword: kw.keyword, spent: err.spent, cap: err.cap }, 'quota exhausted mid-sweep, stopping');
        quotaExhausted = err;
        break;
      }
      throw err;
    }

    searchesPerformed += 1;

    const { channelIds } = searchResult;
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
              discoverySource: `keyword:${kw.keyword}`,
            })),
          )
          .run();
      }
    }

    const now = new Date();
    db.update(seedKeywords)
      .set({
        lastUsedAt: now,
        totalUses: sql`${seedKeywords.totalUses} + 1`,
        totalCandidatesProduced: sql`${seedKeywords.totalCandidatesProduced} + ${newCount}`,
      })
      .where(eq(seedKeywords.id, kw.id))
      .run();

    db.insert(pipelineEvents)
      .values({
        runId: args.runId,
        stage: 'discovery',
        event: 'discovery_keyword_complete',
        details: { keyword: kw.keyword, newCount, alreadyKnownCount: knownCount },
      })
      .run();

    candidatesInserted += newCount;
    candidatesAlreadyKnown += knownCount;

    log.info({ keyword: kw.keyword, newCount, knownCount }, 'keyword sweep done');
  }

  if (searchesPerformed > 0 || candidatesInserted > 0) {
    db.update(pipelineRuns)
      .set({
        searchesPerformed: sql`${pipelineRuns.searchesPerformed} + ${searchesPerformed}`,
        candidatesFound: sql`${pipelineRuns.candidatesFound} + ${candidatesInserted}`,
      })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  if (quotaExhausted) throw quotaExhausted;

  return { searchesPerformed, candidatesInserted, candidatesAlreadyKnown };
}
