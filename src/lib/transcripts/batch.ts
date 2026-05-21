import { getDb } from '../db/client';
import { logger } from '../logger';
import { getOrFetchTranscript } from './store';
import type { TranscriptFetchResult } from './fetcher';

type Db = ReturnType<typeof getDb>;

export async function getOrFetchManyTranscripts(
  args: {
    channelId: string;
    videoIds: string[];
    preferredLanguages?: string[];
  },
  db?: Db,
): Promise<TranscriptFetchResult[]> {
  const { channelId, videoIds, preferredLanguages } = args;

  const results = await Promise.all(
    videoIds.map(async (videoId) => {
      try {
        const result = await getOrFetchTranscript(
          { videoId, channelId, preferredLanguages },
          db,
        );
        if (result.ok) {
          logger.info(
            { videoId, language: result.language, characterCount: result.characterCount },
            'transcript ok',
          );
        } else {
          logger.info({ videoId, reason: result.reason }, 'transcript failed');
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.info({ videoId, reason: 'unknown', message }, 'transcript error');
        return { ok: false as const, videoId, reason: 'unknown' as const, message };
      }
    }),
  );

  return results;
}
