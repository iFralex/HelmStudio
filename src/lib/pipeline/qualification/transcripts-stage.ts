import { getDb } from '@/lib/db/client';
import { pipelineEvents } from '@/lib/db/schema';
import { getOrFetchManyTranscripts } from '@/lib/transcripts/batch';
import type { TranscriptFetchResult } from '@/lib/transcripts/fetcher';

type Db = ReturnType<typeof getDb>;

export async function fetchSelectedTranscripts(
  args: { channelId: string; selectedVideoIds: string[]; runId?: number },
  db: Db = getDb(),
): Promise<TranscriptFetchResult[]> {
  const { channelId, selectedVideoIds, runId } = args;

  const results = await getOrFetchManyTranscripts({
    channelId,
    videoIds: selectedVideoIds,
  });

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  db.insert(pipelineEvents)
    .values({
      runId: runId ?? null,
      channelId,
      stage: 'qualification',
      event: 'transcripts_fetched',
      details: { total: results.length, succeeded, failed },
    })
    .run();

  return results;
}
