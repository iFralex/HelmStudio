import type { SelectInput } from './select';
import type { SelectOutput } from '@/lib/llm/schemas';
import type { TranscriptFetchResult } from '@/lib/transcripts/fetcher';
import { escapeXml } from './xml-helpers';

export const version = 'qualify-v2';

export const system = `You are an expert evaluator of YouTube creators' workflow automation potential.
You analyze public channel data — channel metadata, recent video metadata,
your own earlier classification of those videos, and the transcripts of the
ones you flagged as most representative — to decide whether the creator's
video-making process has automatable elements that an AI-tools provider could
productize for them.

You think about: research workload (clearly visible in transcripts of news,
review, analysis content), scripting patterns (repeated phrases, intros,
outros, segment structure observable across transcripts), recurring formats,
production cadence, evidence of single-operator vs team production, topical
freshness needs, and language.

When you cite evidence from transcripts in your \`signals\`, set the \`videoId\`
field so the operator can verify against the source.

You answer ONLY in JSON, conforming exactly to the schema in the user message.
No prose outside the JSON. No markdown fences.`;

export type QualifyInput = SelectInput & {
  selection: SelectOutput;
  transcripts: Array<TranscriptFetchResult & { ok: true }>;
  failedTranscripts: Array<{ videoId: string; reason: string }>;
};

export function userTemplate(input: QualifyInput): string {
  const { channel, aggregates, videos, selection, transcripts, failedTranscripts } = input;

  const channelXml = `<channel>
  <id>${channel.id}</id>
  <title>${escapeXml(channel.title)}</title>
  <description>${escapeXml(channel.description ?? '')}</description>
  <country>${channel.country ?? 'unknown'}</country>
  <language>${channel.defaultLanguage ?? 'unknown'}</language>
  <subscribers>${channel.subscriberCount ?? 'unknown'}</subscribers>
  <total_views>${channel.viewCount ?? 'unknown'}</total_views>
  <total_videos>${channel.videoCount ?? 'unknown'}</total_videos>
  <channel_age>${channel.channelPublishedAt ?? 'unknown'}</channel_age>
</channel>`;

  const aggregatesXml = `<channel_aggregates>
  <uploads_per_week_last_90d>${aggregates.uploadsPerWeekLast90d.toFixed(2)}</uploads_per_week_last_90d>
  <avg_duration_seconds>${Math.round(aggregates.avgDurationSeconds)}</avg_duration_seconds>
  <duration_stddev_seconds>${Math.round(aggregates.durationStddevSeconds)}</duration_stddev_seconds>
  <avg_views>${Math.round(aggregates.avgViews)}</avg_views>
  <distinct_categories>${aggregates.distinctCategories}</distinct_categories>
  <title_length_stddev>${aggregates.titleLengthStddev.toFixed(1)}</title_length_stddev>
</channel_aggregates>`;

  const videosXml = videos
    .map(
      (v, i) => `  <video index="${i + 1}">
    <id>${v.id}</id>
    <title>${escapeXml(v.title)}</title>
    <published_at>${v.publishedAt}</published_at>
    <duration_seconds>${v.durationSeconds ?? 'unknown'}</duration_seconds>
    <view_count>${v.viewCount ?? 'unknown'}</view_count>
    <like_count>${v.likeCount ?? 'unknown'}</like_count>
    <comment_count>${v.commentCount ?? 'unknown'}</comment_count>
    <tags>${(v.tags ?? []).join(', ')}</tags>
    <category_id>${v.categoryId ?? 'unknown'}</category_id>
    <language>${v.defaultLanguage ?? v.defaultAudioLanguage ?? 'unknown'}</language>
    <description>${escapeXml((v.description ?? '').slice(0, 300))}</description>
  </video>`,
    )
    .join('\n');

  const classificationLines = selection.videoClassifications
    .map(
      (vc) =>
        `    <video_classification video_id="${vc.videoId}" classification="${vc.classification}" automation_relevance_score="${vc.automationRelevanceScore}"/>`,
    )
    .join('\n');

  const classificationXml = `<your_earlier_classification>
  <format_consistency_summary>${escapeXml(selection.formatConsistencySummary)}</format_consistency_summary>
  <selection_rationale>${escapeXml(selection.selectionRationale)}</selection_rationale>
  <video_classifications>
${classificationLines}
  </video_classifications>
</your_earlier_classification>`;

  const videoMap = new Map(videos.map((v) => [v.id, v]));

  const transcriptItems: string[] = transcripts.map((t) => {
    const video = videoMap.get(t.videoId);
    return `  <transcript video_id="${t.videoId}">
    <title>${escapeXml(video?.title ?? t.videoId)}</title>
    <duration_seconds>${video?.durationSeconds ?? 'unknown'}</duration_seconds>
    <language>${t.language}</language>
    <text>${escapeXml(t.text)}</text>
  </transcript>`;
  });

  if (failedTranscripts.length > 0) {
    const failedLines = failedTranscripts
      .map((f) => `    <video id="${f.videoId}" reason="${escapeXml(f.reason)}"/>`)
      .join('\n');
    transcriptItems.push(`  <transcripts_unavailable>\n${failedLines}\n  </transcripts_unavailable>`);
  }

  const transcriptsXml = `<transcripts count="${transcripts.length}">
${transcriptItems.join('\n')}
</transcripts>`;

  return `<channel_analysis_request>
${channelXml}

${aggregatesXml}

<recent_videos count="${videos.length}">
${videosXml}
</recent_videos>

${classificationXml}

${transcriptsXml}

<task>
Output a single JSON object conforming to this schema:

{
  "nicheClassification": string,
  "formatType": string,
  "automationPotentialScore": integer,
  "automatableWorkflows": [
    {
      "name": string,
      "description": string,
      "automationApproach": string,
      "estimatedTimeSavedPerVideoMinutes": integer
    }
  ],
  "suggestedSolution": string,
  "pitchAngle": string,
  "pitchLanguage": "it" | "en",
  "signals": [
    {
      "type": "positive" | "negative",
      "evidence": string,
      "videoId": string | null
    }
  ],
  "disqualifiers": [string],
  "confidence": number,
  "rationale": string
}

You now have richer evidence than metadata alone: cite specific transcript
excerpts in \`signals\` when relevant, and let the transcripts inform the
SPECIFICITY of \`automatableWorkflows.description\` and \`suggestedSolution\`.
</task>
</channel_analysis_request>`;
}

