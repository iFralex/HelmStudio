import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { channels, pipelineEvents, videos } from '@/lib/db/schema';
import { getChannelById } from '@/lib/db/queries';
import { LlmBusinessRuleError, LlmFormatError } from '@/lib/llm/call';
import { runFinalQualification } from '@/lib/llm/qualify';
import type { QualifyInput } from '@/lib/llm/qualify';
import { runVideoSelection } from '@/lib/llm/select';
import { computeChannelAggregates } from '@/lib/pipeline/aggregates';
import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';
import { shouldQualify } from './policy';
import { fetchSelectedTranscripts } from './transcripts-stage';

type Db = ReturnType<typeof getDb>;

export async function qualifyChannel(
  args: { channelId: string; runId: number; force?: boolean },
  db: Db = getDb(),
): Promise<{
  status: 'qualified' | 'skipped' | 'rejected_post_qual';
  reason?: string;
  qualificationId?: number;
}> {
  const { channelId, runId, force } = args;

  const decision = await shouldQualify(channelId, { force }, db);
  if (decision.skip) {
    return { status: 'skipped', reason: decision.reason };
  }

  const channel = await getChannelById(channelId, db);
  if (!channel) return { status: 'skipped', reason: 'channel_not_found' };

  const videoRows = db
    .select()
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .orderBy(desc(videos.publishedAt))
    .limit(20)
    .all();

  const channelDetail: ChannelDetail = {
    id: channel.id,
    handle: channel.handle,
    title: channel.title,
    description: channel.description,
    country: channel.country,
    defaultLanguage: channel.defaultLanguage,
    customUrl: channel.customUrl,
    subscriberCount: channel.subscriberCount,
    viewCount: channel.viewCount,
    videoCount: channel.videoCount,
    uploadsPlaylistId: channel.uploadsPlaylistId,
    thumbnailUrl: channel.thumbnailUrl,
    channelPublishedAt: channel.channelPublishedAt,
  };

  const videoDetails: VideoDetail[] = videoRows.map((v) => ({
    id: v.id,
    channelId: v.channelId,
    title: v.title,
    description: v.description,
    publishedAt: v.publishedAt.toISOString(),
    duration: v.duration,
    durationSeconds: v.durationSeconds,
    viewCount: v.viewCount,
    likeCount: v.likeCount,
    commentCount: v.commentCount,
    thumbnailUrl: v.thumbnailUrl,
    tags: v.tags ?? null,
    categoryId: v.categoryId,
    defaultLanguage: v.defaultLanguage,
    defaultAudioLanguage: v.defaultAudioLanguage,
  }));

  const aggregates = await computeChannelAggregates(channelId, db);

  try {
    const { selectionId, output: selectionOutput } = await runVideoSelection(
      { channelId, runId, input: { channel: channelDetail, aggregates, videos: videoDetails } },
      db,
    );

    const transcriptResults = await fetchSelectedTranscripts(
      { channelId, selectedVideoIds: selectionOutput.selectedVideoIds, runId },
      db,
    );

    const successfulTranscripts = transcriptResults.filter(
      (r): r is typeof r & { ok: true } => r.ok,
    );
    const failedTranscripts = transcriptResults
      .filter((r): r is typeof r & { ok: false } => !r.ok)
      .map((r) => ({ videoId: r.videoId, reason: r.reason }));

    const qualifyInput: QualifyInput = {
      channel: channelDetail,
      aggregates,
      videos: videoDetails,
      selection: selectionOutput,
      transcripts: successfulTranscripts,
      failedTranscripts,
    };

    const { qualificationId, output: qualOutput } = await runFinalQualification(
      { channelId, runId, videoSelectionId: selectionId, input: qualifyInput },
      db,
    );

    db.update(channels)
      .set({
        latestQualificationId: qualificationId,
        latestAutomationScore: qualOutput.scores.final,
        lastQualifiedAt: new Date(),
        discoveryStatus: 'qualified',
      })
      .where(eq(channels.id, channelId))
      .run();

    db.insert(pipelineEvents)
      .values({
        runId,
        channelId,
        stage: 'qualification',
        event: 'channel_qualified',
        details: {
          score: qualOutput.scores.final,
          transcriptsSuccessful: successfulTranscripts.length,
          transcriptsFailed: failedTranscripts.length,
        },
      })
      .run();

    return { status: 'qualified', qualificationId };
  } catch (err) {
    if (err instanceof LlmFormatError || err instanceof LlmBusinessRuleError) {
      db.update(channels)
        .set({ discoveryStatus: 'rejected_post_qual', rejectionReason: 'llm_format_failure' })
        .where(eq(channels.id, channelId))
        .run();

      db.insert(pipelineEvents)
        .values({
          runId,
          channelId,
          stage: 'qualification',
          event: 'channel_qualification_failed',
          details: { error: err.message },
        })
        .run();

      return { status: 'rejected_post_qual', reason: 'llm_format_failure' };
    }
    throw err;
  }
}
