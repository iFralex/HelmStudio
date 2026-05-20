import { eq, and, isNull, isNotNull, sql, desc } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { channels, videos, pipelineRuns, pipelineEvents } from '../../db/schema';
import { getUploadsPlaylistItems, getVideos } from '../../youtube/operations';
import { getFilters } from '../../services/settings';
import { QuotaExhausted } from '../../youtube/quota';
import { childLogger } from '../../logger';

type Db = ReturnType<typeof getDb>;

export async function fetchVideosForSurvivingChannels(
  args: { runId: number; limit: number },
  db: Db = getDb(),
): Promise<{ channelsWithVideos: number; channelsInactive: number; videosFetched: number }> {
  const log = childLogger({ module: 'video-enrichment', runId: args.runId });

  const filters = await getFilters(db);

  const survivingChannels = db
    .select({ id: channels.id, uploadsPlaylistId: channels.uploadsPlaylistId })
    .from(channels)
    .where(
      and(
        eq(channels.discoveryStatus, 'enriched'),
        isNull(channels.latestQualificationId),
        isNotNull(channels.uploadsPlaylistId),
      ),
    )
    .orderBy(desc(channels.discoveredAt))
    .limit(args.limit)
    .all();

  if (survivingChannels.length === 0) {
    log.info('no surviving channels to fetch videos for');
    return { channelsWithVideos: 0, channelsInactive: 0, videosFetched: 0 };
  }

  let channelsWithVideos = 0;
  let channelsInactive = 0;
  let videosFetched = 0;

  const inactiveCutoff = new Date(Date.now() - filters.inactiveDays * 24 * 60 * 60 * 1000);

  for (const channel of survivingChannels) {
    const playlistId = channel.uploadsPlaylistId!;

    let videoIds: string[];
    try {
      const result = await getUploadsPlaylistItems(
        { playlistId, maxResults: 20, runId: args.runId },
        db,
      );
      videoIds = result.videoIds;
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ spent: err.spent, cap: err.cap }, 'quota exhausted during playlist fetch, stopping');
        break;
      }
      throw err;
    }

    if (videoIds.length === 0) {
      rejectAsInactive(db, args.runId, channel.id);
      channelsInactive += 1;
      continue;
    }

    let fetchResult: Awaited<ReturnType<typeof getVideos>>;
    try {
      fetchResult = await getVideos(
        { ids: videoIds, channelIdForStorage: channel.id, runId: args.runId },
        db,
      );
    } catch (err) {
      if (err instanceof QuotaExhausted) {
        log.warn({ spent: err.spent, cap: err.cap }, 'quota exhausted during video fetch, stopping');
        break;
      }
      throw err;
    }

    const { videos: videoDetailList, rawPath } = fetchResult;

    if (videoDetailList.length === 0) {
      rejectAsInactive(db, args.runId, channel.id);
      channelsInactive += 1;
      continue;
    }

    const mostRecentPublishedAt = videoDetailList.reduce((max, v) => {
      const d = new Date(v.publishedAt);
      return d > max ? d : max;
    }, new Date(0));

    if (mostRecentPublishedAt < inactiveCutoff) {
      rejectAsInactive(db, args.runId, channel.id);
      channelsInactive += 1;
      continue;
    }

    for (const video of videoDetailList) {
      db.insert(videos)
        .values({
          id: video.id,
          channelId: channel.id,
          title: video.title,
          description: video.description,
          publishedAt: new Date(video.publishedAt),
          duration: video.duration,
          durationSeconds: video.durationSeconds,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          thumbnailUrl: video.thumbnailUrl,
          tags: video.tags ?? undefined,
          categoryId: video.categoryId,
          defaultLanguage: video.defaultLanguage,
          defaultAudioLanguage: video.defaultAudioLanguage,
          rawPath,
        })
        .onConflictDoNothing()
        .run();

      videosFetched += 1;
    }

    channelsWithVideos += 1;

    log.info({ channelId: channel.id, videoCount: videoDetailList.length }, 'videos fetched for channel');
  }

  if (channelsWithVideos > 0) {
    db.update(pipelineRuns)
      .set({ channelsEnriched: sql`${pipelineRuns.channelsEnriched} + ${channelsWithVideos}` })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  if (channelsInactive > 0) {
    db.update(pipelineRuns)
      .set({ channelsPreRejected: sql`${pipelineRuns.channelsPreRejected} + ${channelsInactive}` })
      .where(eq(pipelineRuns.id, args.runId))
      .run();
  }

  log.info({ channelsWithVideos, channelsInactive, videosFetched }, 'video enrichment complete');

  return { channelsWithVideos, channelsInactive, videosFetched };
}

function rejectAsInactive(db: Db, runId: number, channelId: string): void {
  db.update(channels)
    .set({ discoveryStatus: 'rejected_pre_qual', rejectionReason: 'inactive' })
    .where(eq(channels.id, channelId))
    .run();

  db.insert(pipelineEvents)
    .values({
      runId,
      channelId,
      stage: 'filter',
      event: 'channel_pre_rejected',
      details: { reason: 'inactive' },
    })
    .run();
}
