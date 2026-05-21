import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';
import type { ChannelAggregates } from '@/lib/pipeline/aggregates';
import { escapeXml } from './xml-helpers';

export const version = 'select-v1';

export const system = `You are an expert YouTube channel analyst specializing in automation potential assessment for Italian content creators.

Your task is to analyze a list of recent videos from a YouTube channel and:
1. Classify each video into one of four categories based on its format and content
2. Select 3 to 5 videos that best represent the channel's content for deeper transcript analysis

## Video Classification Categories

- **format_anchor**: Videos that define the channel's primary recurring format (e.g., consistent intro/outro, fixed segment structure, predictable topic cadence). These are the most representative of what the channel "always does."
- **representative**: Videos that are typical of the channel's content but not as structurally rigid as format anchors. Standard uploads that reflect the average output.
- **extemporaneous**: Spontaneous, unplanned, or reactive content (vlogs, news reactions, Q&As, live stream highlights). Structurally unpredictable.
- **outlier**: Videos that clearly deviate from the channel's norm — collaborations, special events, experimental formats, or significantly different topics.

## Selection Criteria for Deep Analysis

Select 3–5 videos that together provide the best signal for automation potential. Prefer:
- At least 2 format_anchor or representative videos (these reveal automation patterns)
- Diversity in recency (not all from the same week)
- Videos likely to have substantive transcripts (avoid music-only, shorts under 60s, or silent tutorials)
- Videos where the creator's voice/opinion/process is evident

## Output Format

Respond with a JSON object matching this exact schema:
{
  "videoClassifications": [/* one entry per video, exactly 20 items */],
  "formatConsistencySummary": "/* 2-3 sentence summary of the channel's format consistency and patterns */",
  "selectedVideoIds": ["/* 3-5 video IDs from the classified list */"],
  "selectionRationale": "/* 1-2 sentences explaining why these videos were chosen */"
}

Each videoClassification entry:
{
  "videoId": "string",
  "classification": "format_anchor" | "representative" | "extemporaneous" | "outlier",
  "reasoning": "/* 1 sentence explaining this classification */",
  "automationRelevanceScore": /* integer 0-10, how useful this video's content would be for identifying automation opportunities */
}`;

export type SelectInput = {
  channel: ChannelDetail;
  aggregates: ChannelAggregates;
  videos: VideoDetail[];
};

export function userTemplate(input: SelectInput): string {
  const { channel, aggregates, videos } = input;

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
    <tags>${(v.tags ?? []).map(escapeXml).join(', ')}</tags>
    <category_id>${v.categoryId ?? 'unknown'}</category_id>
    <language>${v.defaultLanguage ?? v.defaultAudioLanguage ?? 'unknown'}</language>
    <description>${escapeXml((v.description ?? '').slice(0, 300))}</description>
  </video>`,
    )
    .join('\n');

  return `<channel_analysis_request>
${channelXml}

${aggregatesXml}

<recent_videos count="${videos.length}">
${videosXml}
</recent_videos>

<task>
Classify each of the ${videos.length} videos above and select 3–5 for deep transcript analysis.
Return a JSON object with videoClassifications (one entry per video, exactly ${videos.length} items), formatConsistencySummary, selectedVideoIds (3–5), and selectionRationale.
</task>
</channel_analysis_request>`;
}

