import type { SelectInput } from './select';
import type { SelectOutput } from '@/lib/llm/schemas';
import type { TranscriptFetchResult } from '@/lib/transcripts/fetcher';
import { escapeXml } from './xml-helpers';

export const version = 'qualify-v3';

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

## Scoring rules

You produce THREE independent sub-scores plus a weighted final score.

**workflowRepeatability (0–100):** How mechanical and scriptable is this creator's
production process? High = identical structure every video, template-driven, heavy
research/scripting load. Low = fully improvised, purely physical/performance-driven.

**evidenceStrength (0–100):** How much of your analysis is grounded in explicit
transcript evidence vs. inferred from format alone? High = creator explicitly states
pain points, uses broken tools, mentions specific workflows. Low = you are reasoning
from channel structure without direct evidence.

**commercialViability (0–100):** Is this creator a realistic buyer of AI workflow tools?
Consider: channel size (>100k helps), niche (corporate/TV channels rarely buy SaaS),
creator type (solo operator vs. TV network), copyright exposure, tech-savviness.
High = solo creator, original content, evident productivity mindset. Low = corporate
ownership, fully third-party content, copyright-at-risk channel.

**final (0–100):** Weighted average. Compute as:
  round(workflowRepeatability × 0.40 + evidenceStrength × 0.35 + commercialViability × 0.25)

### Score anchors — calibrate against these before writing your scores
- final 90+: creator explicitly states broken workflow AND already pays for tools AND has heavy structured research
- final 75–89: clear transcript evidence of repetitive/scriptable workflow; solo creator; tech-savvy
- final 50–74: structured format but evidence is mostly inferred; OR strong evidence but only 1–2 workflows
- final 25–49: mostly personality-driven; some minor automatable elements; limited evidence
- final 10–24: very narrow automation surface; niche custom tooling required
- final <10: no spoken content / purely visual-physical / third-party content with legal risk

### Disqualifier score impact rules (apply BEFORE writing final score)
Every disqualifier must reduce the relevant sub-score:
- "content is entirely third-party / copyright risk" → commercialViability −25 minimum
- "corporate/network ownership" → commercialViability −20 minimum (procurement blocks SaaS)
- "no spoken content / purely visual" → evidenceStrength −30 minimum
- "fully improvised / no repeatable structure" → workflowRepeatability −25 minimum
List all deductions you applied in \`disqualifierScoreImpact\`.

## Evidence tier rules for workflows

Every workflow in \`automatableWorkflows\` must declare its evidence tier:
- **TIER_1**: creator explicitly states a pain point in a transcript (e.g. "il tool è rotto", "è un lavoraccio")
- **TIER_2**: observable behavior that strongly implies the problem (uses external tools, asks community for tips, outsources specific tasks)
- **TIER_3**: inferred from format structure alone — no direct evidence

**Do not include TIER_3-only workflows.** If every candidate workflow is TIER_3, your
automatableWorkflows array must be empty and your final score must be below 50.

For \`estimatedTimeSavedPerVideoMinutes\`, derive the number from the workflow evidence:
state in \`timeSavedReasoning\` what the current manual time is and how you arrived at
the savings estimate. Do not invent round numbers without reasoning.

## analysisMode

Set to "evidence_driven" if at least half your workflows are TIER_1 or TIER_2 AND
evidenceStrength ≥ 60. Otherwise set to "inferred".

## Pitch language

Always write \`pitchAngle\` and \`suggestedSolution\` in English regardless of channel language.

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
    <tags>${(v.tags ?? []).map(escapeXml).join(', ')}</tags>
    <category_id>${v.categoryId ?? 'unknown'}</category_id>
    <language>${v.defaultLanguage ?? v.defaultAudioLanguage ?? 'unknown'}</language>
    <description>${escapeXml((v.description ?? '').slice(0, 300))}</description>
  </video>`,
    )
    .join('\n');

  const classificationLines = selection.videoClassifications
    .map(
      (vc) =>
        `    <video_classification video_id="${escapeXml(vc.videoId)}" classification="${vc.classification}" automation_relevance_score="${vc.automationRelevanceScore}"/>`,
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
    return `  <transcript video_id="${escapeXml(t.videoId)}">
    <title>${escapeXml(video?.title ?? t.videoId)}</title>
    <duration_seconds>${video?.durationSeconds ?? 'unknown'}</duration_seconds>
    <language>${t.language}</language>
    <text>${escapeXml(t.text)}</text>
  </transcript>`;
  });

  if (failedTranscripts.length > 0) {
    const failedLines = failedTranscripts
      .map((f) => `    <video id="${escapeXml(f.videoId)}" reason="${escapeXml(f.reason)}"/>`)
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
  "scores": {
    "workflowRepeatability": integer (0–100),
    "evidenceStrength": integer (0–100),
    "commercialViability": integer (0–100),
    "final": integer (0–100, computed as round(workflowRepeatability×0.40 + evidenceStrength×0.35 + commercialViability×0.25))
  },
  "analysisMode": "evidence_driven" | "inferred",
  "analysisModeReasoning": string,
  "automatableWorkflows": [
    {
      "name": string,
      "description": string,
      "automationApproach": string,
      "evidenceTier": "TIER_1" | "TIER_2" | "TIER_3",
      "evidenceBasis": string,
      "estimatedTimeSavedPerVideoMinutes": integer,
      "timeSavedReasoning": string
    }
  ],
  "suggestedSolution": string,
  "pitchAngle": string,
  "signals": [
    {
      "type": "positive" | "negative",
      "evidence": string,
      "videoId": string | null
    }
  ],
  "disqualifiers": [string],
  "disqualifierScoreImpact": string,
  "confidence": number (0–1),
  "rationale": string
}

Remember:
- Do NOT include TIER_3-only workflows. If you have no TIER_1 or TIER_2 workflows, leave automatableWorkflows empty.
- Apply disqualifier score deductions before computing final.
- timeSavedReasoning must show your calculation, not just a number.
- pitchAngle must be in English.
- Let the transcripts inform the SPECIFICITY of automatableWorkflows and suggestedSolution.
</task>
</channel_analysis_request>`;
}
