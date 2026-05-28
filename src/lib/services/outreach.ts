import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { outreachDrafts, pipelineEvents, transcripts, videos } from '@/lib/db/schema';
import {
  getChannelById,
  getQualificationById,
  getCurrentDraft as queryGetCurrentDraft,
} from '@/lib/db/queries';
import type { OutreachDraft } from '@/lib/db/queries';
import { assembleEmail, runDraftGeneration } from '@/lib/llm/draft';
import { system as draftSystem, userTemplate as draftUserTemplate } from '@/lib/llm/prompts/draft';
import type { DraftInput, HookVideo } from '@/lib/llm/prompts/draft';
import type { QualifyOutput } from '@/lib/llm/schemas';
import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';
import { logger } from '@/lib/logger';

const HOOK_TRANSCRIPT_MAX_CHARS = 1800;

function resolveRecipientFirstName(
  channel: ChannelDetail,
  qualification: QualifyOutput,
): string | null {
  // 1) AI-extracted name from qualification (most reliable — looks at transcripts + all video data)
  if (qualification.creatorFirstName && qualification.creatorFirstName.trim().length > 0) {
    return qualification.creatorFirstName.trim();
  }

  // 2) Fallback: regex on channel description ("Mi chiamo X", "Sono X")
  if (channel.description) {
    const match = channel.description.match(/(?:Mi chiamo|Sono|I'm|My name is)\s+([A-ZÀ-Ý][a-zà-ÿ]{1,20})/);
    if (match && match[1]) return match[1];
  }

  // 3) Fallback: channel title in "FirstName LastName" form
  const title = channel.title.trim();
  const isLikelyHumanName =
    /^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý][a-zà-ÿ]+( [A-ZÀ-Ý][a-zà-ÿ]+)?$/.test(title) &&
    title.length <= 40;
  if (isLikelyHumanName) {
    const first = title.split(/\s+/)[0];
    if (first) return first;
  }

  return null;
}

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

function truncateTranscript(text: string): string {
  const cleaned = text.trim();
  if (cleaned.length <= HOOK_TRANSCRIPT_MAX_CHARS) return cleaned;
  return cleaned.slice(0, HOOK_TRANSCRIPT_MAX_CHARS) + '…';
}

function pickHookVideo(
  channelId: string,
  recentVideos: VideoDetail[],
  signals: QualifyOutput['signals'],
  db: Db,
): HookVideo | null {
  const fallbackVideo = recentVideos[0];
  if (!fallbackVideo) return null;

  const evidenceCounts = new Map<string, number>();
  for (const s of signals) {
    if (s.videoId) evidenceCounts.set(s.videoId, (evidenceCounts.get(s.videoId) ?? 0) + 1);
  }
  const evidenceOrder = [...evidenceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const candidateIds = [
    ...evidenceOrder.filter((id) => recentVideos.some((v) => v.id === id)),
    ...recentVideos.map((v) => v.id).filter((id) => !evidenceOrder.includes(id)),
  ];

  const transcriptRows = db
    .select()
    .from(transcripts)
    .where(and(eq(transcripts.channelId, channelId), inArray(transcripts.videoId, candidateIds)))
    .all();
  const transcriptByVideo = new Map(transcriptRows.map((t) => [t.videoId, t]));

  for (const id of candidateIds) {
    const t = transcriptByVideo.get(id);
    if (t && t.fetchSucceeded && t.text && t.text.trim().length > 0) {
      const video = recentVideos.find((v) => v.id === id)!;
      return { video, transcriptExcerpt: truncateTranscript(t.text) };
    }
  }

  return { video: fallbackVideo, transcriptExcerpt: null };
}

function rowToQualifyOutput(
  qual: NonNullable<Awaited<ReturnType<typeof getQualificationById>>>,
): QualifyOutput {
  return {
    nicheClassification: qual.nicheClassification ?? '',
    formatType: qual.formatType ?? '',
    scores: {
      workflowRepeatability: qual.workflowRepeatabilityScore ?? 0,
      evidenceStrength: qual.evidenceStrengthScore ?? 0,
      commercialViability: qual.commercialViabilityScore ?? 0,
      final: qual.automationPotentialScore ?? 0,
    },
    analysisMode: (qual.analysisMode ?? 'inferred') as QualifyOutput['analysisMode'],
    analysisModeReasoning: '',
    automatableWorkflows:
      (qual.automatableWorkflows as QualifyOutput['automatableWorkflows']) ?? [],
    suggestedSolution: qual.suggestedSolution ?? '',
    pitchAngle: qual.pitchAngle ?? '',
    signals: (qual.signals as QualifyOutput['signals']) ?? [],
    disqualifiers: (qual.disqualifiers as string[]) ?? [],
    disqualifierScoreImpact: qual.disqualifierScoreImpact ?? '',
    salesObjections: (qual.salesObjections as string[] | null) ?? [''],
    confidence: qual.confidence ?? 0,
    rationale: qual.rationale ?? '',
    creatorFirstName: qual.creatorFirstName ?? null,
  };
}

async function buildDraftContext(
  channelId: string,
  db: Db,
): Promise<{ input: DraftInput; qualificationId: number; language: 'it' | 'en' }> {
  const channel = await getChannelById(channelId, db);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  if (!channel.latestQualificationId) {
    throw new Error(`Channel ${channelId} has no qualification; run qualification first`);
  }

  const qualRow = await getQualificationById(channel.latestQualificationId, db);
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
  const language: 'it' | 'en' = (qualRow.pitchLanguage as 'it' | 'en' | null) ?? 'en';

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

  if (qualification.automatableWorkflows.length === 0) {
    logger.warn({ channelId }, 'generating draft with no automatable workflows; prompt context will be degraded');
  }

  const hookVideo = pickHookVideo(channelId, recentVideos, qualification.signals, db);
  const recipientFirstName = resolveRecipientFirstName(channelDetail, qualification);

  const input: DraftInput = {
    channel: channelDetail,
    qualification,
    recentVideos,
    hookVideo,
    recipientFirstName,
    language,
  };

  return { input, qualificationId: qualRow.id, language };
}

export async function generateDraftForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<{ draftId: number; subject: string; body: string; language: 'it' | 'en' }> {
  const { input, qualificationId, language } = await buildDraftContext(channelId, db);

  const { draftId, output } = await runDraftGeneration(
    { channelId, qualificationId, input },
    db,
  );

  return { draftId, subject: output.subject, body: output.body, language };
}

export async function getDraftPrompt(
  channelId: string,
  db: Db = getDb(),
): Promise<{ system: string; user: string; language: 'it' | 'en' }> {
  const { input, language } = await buildDraftContext(channelId, db);
  return { system: draftSystem, user: draftUserTemplate(input), language };
}

export async function addManualDraft(
  args: {
    channelId: string;
    subject: string;
    body: string;
    language: 'it' | 'en';
    recipientFirstName?: string | null;
  },
  db: Db = getDb(),
): Promise<{ draftId: number }> {
  const { channelId, subject, body, language, recipientFirstName = null } = args;

  const channel = await getChannelById(channelId, db);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  const assembledBody = assembleEmail(body, recipientFirstName, language);

  const draftId = db.transaction((tx) => {
    tx.update(outreachDrafts)
      .set({ isCurrent: false })
      .where(and(eq(outreachDrafts.channelId, channelId), eq(outreachDrafts.isCurrent, true)))
      .run();

    const row = tx
      .insert(outreachDrafts)
      .values({
        channelId,
        qualificationId: channel.latestQualificationId ?? null,
        language,
        subject,
        body: assembledBody,
        modelUsed: 'manual',
        promptVersion: 'manual',
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        rawResponsePath: 'manual',
        isCurrent: true,
      })
      .returning({ id: outreachDrafts.id })
      .get()!;

    tx.insert(pipelineEvents)
      .values({ channelId, stage: 'meta', level: 'info', event: 'draft_added_manually' })
      .run();

    return row.id;
  });

  logger.info({ channelId, draftId }, 'manual outreach draft added');
  return { draftId };
}

export async function listDraftsForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<OutreachDraft[]> {
  return db
    .select()
    .from(outreachDrafts)
    .where(eq(outreachDrafts.channelId, channelId))
    .orderBy(desc(outreachDrafts.createdAt), desc(outreachDrafts.id))
    .all();
}

export async function getCurrentDraft(
  channelId: string,
  db: Db = getDb(),
): Promise<OutreachDraft | null> {
  return queryGetCurrentDraft(channelId, db);
}
