import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { outreachDrafts, videos } from '@/lib/db/schema';
import {
  getChannelById,
  getLatestQualification,
  getCurrentDraft as queryGetCurrentDraft,
} from '@/lib/db/queries';
import type { OutreachDraft } from '@/lib/db/queries';
import { runDraftGeneration } from '@/lib/llm/draft';
import type { DraftInput } from '@/lib/llm/draft';
import type { QualifyOutput } from '@/lib/llm/schemas';
import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';

export type { OutreachDraft };

type Db = ReturnType<typeof getDb>;

function rowToChannelDetail(
  channel: NonNullable<Awaited<ReturnType<typeof getChannelById>>>,
): ChannelDetail {
  return {
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
}

function rowToQualifyOutput(
  qual: NonNullable<Awaited<ReturnType<typeof getLatestQualification>>>,
): QualifyOutput {
  return {
    nicheClassification: qual.nicheClassification ?? '',
    formatType: qual.formatType ?? '',
    automationPotentialScore: qual.automationPotentialScore ?? 0,
    automatableWorkflows:
      (qual.automatableWorkflows as QualifyOutput['automatableWorkflows']) ?? [],
    suggestedSolution: qual.suggestedSolution ?? '',
    pitchAngle: qual.pitchAngle ?? '',
    pitchLanguage: qual.pitchLanguage ?? 'it',
    signals: (qual.signals as QualifyOutput['signals']) ?? [],
    disqualifiers: (qual.disqualifiers as string[]) ?? [],
    confidence: qual.confidence ?? 0,
    rationale: qual.rationale ?? '',
  };
}

export async function generateDraftForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<{ draftId: number; subject: string; body: string; language: 'it' | 'en' }> {
  const channel = await getChannelById(channelId, db);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  if (!channel.latestQualificationId) {
    throw new Error(`Channel ${channelId} has no qualification; run qualification first`);
  }

  const qualRow = await getLatestQualification(channelId, db);
  if (!qualRow) throw new Error(`No qualification row found for channel ${channelId}`);

  const videoRows = db
    .select()
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .orderBy(desc(videos.publishedAt))
    .limit(5)
    .all();

  const channelDetail = rowToChannelDetail(channel);
  const qualification = rowToQualifyOutput(qualRow);
  const language = qualification.pitchLanguage;

  const recentVideos: VideoDetail[] = videoRows.map((v) => ({
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

  const draftInput: DraftInput = {
    channel: channelDetail,
    qualification,
    recentVideos,
    language,
  };

  const { draftId, output } = await runDraftGeneration(
    { channelId, qualificationId: qualRow.id, input: draftInput },
    db,
  );

  return { draftId, subject: output.subject, body: output.body, language };
}

export async function listDraftsForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<OutreachDraft[]> {
  return db
    .select()
    .from(outreachDrafts)
    .where(eq(outreachDrafts.channelId, channelId))
    .orderBy(desc(outreachDrafts.createdAt))
    .all();
}

export async function getCurrentDraft(
  channelId: string,
  db: Db = getDb(),
): Promise<OutreachDraft | null> {
  return queryGetCurrentDraft(channelId, db);
}
