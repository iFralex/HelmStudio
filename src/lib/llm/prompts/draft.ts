import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';
import type { QualifyOutput } from '@/lib/llm/schemas';
import { escapeXml } from './xml-helpers';

export const version = 'draft-v1';

export const system = `You are a specialist in personalised cold outreach for AI-automation services targeted at independent YouTube creators.

You write concise, genuine, non-clickbait emails that feel like they were written by a human who has actually watched the channel. The goal is to start a conversation, not to sell immediately.

Rules you must follow without exception:
- Write the entire email (subject and body) in the language specified in the request.
- The subject line must be at most 60 characters. Keep it specific and factual — no superlatives or hype.
- The body must be between 120 and 180 words. Count carefully.
- No bullet points or numbered lists anywhere in the body.
- No clickbait phrases ("you won't believe", "incredible opportunity", "game changer", etc.).
- Mention exactly one concrete recurring workflow from the channel's production process and explain briefly how it could be automated.
- Always mention the free-pilot model: week 1 we build the automation, week 2 is a free trial, the creator only pays if it is actually useful.
- Do not promise specific time or money savings you cannot verify.
- Do not use the creator's subscriber count or view numbers as a compliment.
- End with a simple, low-pressure call to action (e.g., ask if they have 15 minutes for a call).

You answer ONLY in JSON, no prose outside the JSON, no markdown fences.
Output exactly:
{
  "subject": "...",
  "body": "..."
}`;

export type DraftInput = {
  channel: ChannelDetail;
  qualification: QualifyOutput;
  recentVideos: VideoDetail[];
  language: 'it' | 'en';
};

export function userTemplate(input: DraftInput): string {
  const { channel, qualification, recentVideos, language } = input;

  const topWorkflow = qualification.automatableWorkflows[0];

  const channelXml = `<channel>
  <id>${channel.id}</id>
  <title>${escapeXml(channel.title)}</title>
  <description>${escapeXml(channel.description ?? '')}</description>
  <country>${channel.country ?? 'unknown'}</country>
  <language>${channel.defaultLanguage ?? 'unknown'}</language>
  <subscribers>${channel.subscriberCount ?? 'unknown'}</subscribers>
</channel>`;

  const videosXml = recentVideos
    .map(
      (v, i) => `  <video index="${i + 1}">
    <id>${v.id}</id>
    <title>${escapeXml(v.title)}</title>
    <published_at>${v.publishedAt}</published_at>
    <duration_seconds>${v.durationSeconds ?? 'unknown'}</duration_seconds>
  </video>`,
    )
    .join('\n');

  const workflowXml = topWorkflow
    ? `<top_workflow>
  <name>${escapeXml(topWorkflow.name)}</name>
  <description>${escapeXml(topWorkflow.description)}</description>
  <automation_approach>${escapeXml(topWorkflow.automationApproach)}</automation_approach>
  <estimated_time_saved_minutes>${topWorkflow.estimatedTimeSavedPerVideoMinutes}</estimated_time_saved_minutes>
</top_workflow>`
    : `<top_workflow>none identified</top_workflow>`;

  return `<outreach_draft_request>
${channelXml}

<recent_videos count="${recentVideos.length}">
${videosXml}
</recent_videos>

<qualification_insights>
  <pitch_angle>${escapeXml(qualification.pitchAngle)}</pitch_angle>
  <suggested_solution>${escapeXml(qualification.suggestedSolution)}</suggested_solution>
  <niche>${escapeXml(qualification.nicheClassification)}</niche>
  <format>${escapeXml(qualification.formatType)}</format>
</qualification_insights>

${workflowXml}

<task>
Write a cold outreach email to the creator of the channel above.
Language: ${language}
Subject: at most 60 characters, specific, no hype.
Body: between 120 and 180 words, no bullets, no clickbait.
Reference the top_workflow above as the concrete automation opportunity.
Include the free-pilot offer: week 1 we build it, week 2 free trial, they only pay if it's useful.

Output a single JSON object:
{
  "subject": "...",
  "body": "..."
}
</task>
</outreach_draft_request>`;
}
