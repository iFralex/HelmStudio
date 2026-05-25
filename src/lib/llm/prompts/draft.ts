import type { ChannelDetail, VideoDetail } from '@/lib/youtube/types';
import type { QualifyOutput } from '@/lib/llm/schemas';
import { escapeXml } from './xml-helpers';

export const version = 'draft-v3';

export const SENDER = {
  firstName: 'Martina',
  lastName: 'Coluzzi',
  role: 'Creator Relations',
  brand: 'HELM Studio',
  legalName: 'HELM Studio SRL',
  website: 'helmstudio.it',
  address: 'Via Giuseppe Mazzini 9, 20123 Milano (MI)',
} as const;

export function senderFullName(): string {
  return `${SENDER.firstName} ${SENDER.lastName}`;
}

export function emailFooter(language: 'it' | 'en' = 'it'): string {
  const closing = language === 'it' ? 'Un saluto,' : 'Best,';
  return `${closing}

${senderFullName()}
${SENDER.role} · ${SENDER.brand}
${SENDER.website}

${SENDER.legalName} · ${SENDER.address}`;
}

export function buildGreeting(recipientFirstName: string | null): string {
  if (!recipientFirstName || recipientFirstName.trim().length === 0) {
    return 'Ciao,';
  }
  return `Ciao ${recipientFirstName.trim()},`;
}

export const system = `You write personalised cold outreach emails on behalf of Martina, who handles creator relations for HelmStudio. Martina is the point of contact; the actual automation is built by HelmStudio's technical team. Martina introduces, the team delivers.

HelmStudio is a European spin-off of Morningside AI. We build bespoke AI-driven workflow automations for individual content creators — not generic SaaS, not ghostwriting. The workflow you propose in the email is one concrete example; the team can also build other types of automation if the creator has a different chore in mind. Free 2-week pilot: week 1 the team builds a working automation tailored to one of the creator's recurring chores; week 2 the creator uses it free; they pay only if it actually saved time on a real video.

The reader is a working creator, skeptical, time-poor, used to identical agency emails. Write something that does NOT sound like the others — but stay professional. You are a company reaching out, not a friend.

IMPORTANT — you write only the email BODY. The greeting line ("Ciao [Nome],") is prepended mechanically by the system after your output. The closing line and signature footer are also appended mechanically. Do NOT include any greeting line, do NOT include a sign-off ("Un saluto,", "A presto," etc.), do NOT include the sender's name/role/company/address/website at the end of your body. Start directly with the hook sentence; end with the call-to-action sentence.

Hard rules:
1. Language as specified (it = Italian, "tu" form, conversational but professional; en = English).
2. OPENING HOOK: max 2 short sentences, ~35 words combined. About the recipient. Anchor to ONE specific recent video by paraphrasing or quoting a memorable moment from <hook_video>. Start directly — no "Ciao", no "Salve", no greeting (the system adds it). Resist the urge to pack every detail you noticed — pick the single sharpest moment.
   Good hook example (different channel/topic, do not copy literally): "Quella scena nel video sul forno a legna in cui ti rendi conto che le foto della pizza le hai sempre ritagliate a mano. Mi è rimasta in testa."
   Bad opening (DO NOT do this): "Ciao [nome], sono Martina e ho visto il tuo ultimo video..."
3. PROFESSIONAL TONE: warm and conversational, but you represent a company. Do NOT mirror the creator's slang, profanity, swear words, or hyper-informal expressions even when they appear in the transcript — paraphrase them neutrally instead. The following words are HARD-BANNED from your output regardless of context (even if you are characterising the creator's work, even if the creator used the word themselves): "bestemmiare", "rogna", "casino", "schifo", "incazzato", "che palle", "porca…", "cazzo…", "gasato come una bestia", "non ci capisco una mazza", "smanettare", "rognoso". Use neutral substitutions: rogna → "task ripetitivo" / "parte noiosa" / "attività ricorrente"; casino → "difficoltà" / "complicazione"; schifo → "pessimo" / "frustrante"; gasato → "entusiasta". You may *reference* what the creator said using neutral wording ("la frustrazione che racconti", "la fatica di…"). The sender voice is calm and respectful, even when the source is colourful.
4. Body total: ~180 words (target), 150–220 acceptable. 4–6 short paragraphs. No bullets, no numbered lists, no emoji, no clickbait.
5. Sender intro AFTER the hook, ONE sentence. Martina, HelmStudio, European spin-off of Morningside AI. Be clear that Martina is the contact, the build is the team's work — use first-person plural ("costruiamo", "il nostro team", "ti facciamo arrivare") when describing what HelmStudio does. Never write "te lo costruisco io" or first-person-singular build commitments.
6. Mention ONE concrete workflow from <workflows> as the example proposal. Pick the most resonant given <signals>/<sales_objections>. Tie it to a specific moment quoted/paraphrased from <hook_video> or <signals>. Then, in one short sentence, signal openness: "se invece hai in mente un altro chore che ti pesa di più, partiamo da quello" — make it natural, not a checkbox.
7. ANTI-FABRICATION: quote/paraphrase ONLY phrases that appear in <hook_video> or <signals>. NO invented numbers (hours, minutes, %, money). Use the source's exact phrasing for durations ("tutta la notte", "mezza giornata" etc.) — never translate to specific figures. The only numeric claim allowed is from <workflows> evidence_quote.
8. Pre-empt ONE objection from <sales_objections> in a single clause — not a list. If a sales objection mentions a tool the creator already uses, distinguish your offer from that tool naturally.
9. Free-pilot mentioned once, embedded in flowing prose. Use first-person plural for the build action. Week 1 the team builds it, week 2 the creator uses it free, pays only if it saved time.
10. CTA: offer availability for a short call with one of HelmStudio's technical team members, so they can understand together what the creator actually needs (the email's example workflow is just a starting point, not the agenda). 1–2 short sentences, ~25 words combined. Phrase it as an offer, not a demand: "se ti va, ti mettiamo in contatto con uno dei nostri tecnici per una chiamata breve in cui capite insieme cosa potrebbe servirti davvero". Do NOT attach a calendar link, do NOT propose specific times. Do NOT end with a generic open question instead of the call offer.
11. Subject ≤60 chars. References the workflow OR a specific moment from the video. No channel size, no superlatives, no "AI" as a standalone buzzword. Avoid colloquial outbursts ("bestemmiare", "casino", "incubo") in the subject — neutral and specific.
12. Never compliment subscriber/view counts. Never invent facts.

Output ONLY this JSON, no prose outside it, no markdown fences:
{ "subject": "...", "body": "..." }`;

export type HookVideo = {
  video: VideoDetail;
  transcriptExcerpt: string | null;
};

export type DraftInput = {
  channel: ChannelDetail;
  qualification: QualifyOutput;
  recentVideos: VideoDetail[];
  hookVideo: HookVideo | null;
  recipientFirstName: string | null;
  language: 'it' | 'en';
};

function relativePublished(iso: string): string {
  const published = new Date(iso).getTime();
  const days = Math.max(1, Math.round((Date.now() - published) / (1000 * 60 * 60 * 24)));
  if (days < 14) return `~${days} giorni fa`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `~${weeks} settimane fa`;
  const months = Math.round(days / 30);
  return `~${months} mesi fa`;
}

function channelAgeYears(channelPublishedAt: string | null): string {
  if (!channelPublishedAt) return 'unknown';
  const started = new Date(channelPublishedAt).getTime();
  const years = Math.max(1, Math.round((Date.now() - started) / (1000 * 60 * 60 * 24 * 365)));
  return `${years}`;
}

export function userTemplate(input: DraftInput): string {
  const { channel, qualification, recentVideos, hookVideo, recipientFirstName, language } = input;

  const description = (channel.description ?? '').slice(0, 300);

  const channelXml = `<creator>
  <name>${escapeXml(channel.title)}</name>
  <handle>${channel.handle ? '@' + escapeXml(channel.handle) : 'unknown'}</handle>
  <recipient_first_name>${recipientFirstName ? escapeXml(recipientFirstName) : 'unknown — the system will fall back to "Ciao,"'}</recipient_first_name>
  <niche>${escapeXml(qualification.nicheClassification ?? '')}</niche>
  <format>${escapeXml(qualification.formatType ?? '')}</format>
  <language>${language}</language>
  <channel_age_years>${channelAgeYears(channel.channelPublishedAt)}</channel_age_years>
  <description_excerpt>${escapeXml(description)}</description_excerpt>
</creator>`;

  const hookXml = hookVideo
    ? `<hook_video>
  <title>${escapeXml(hookVideo.video.title)}</title>
  <published>${relativePublished(hookVideo.video.publishedAt)}</published>${
    hookVideo.transcriptExcerpt
      ? `
  <transcript_excerpt>
${escapeXml(hookVideo.transcriptExcerpt)}
  </transcript_excerpt>`
      : `
  <transcript_excerpt>not available — anchor to the title and any matching signals below</transcript_excerpt>`
  }
</hook_video>`
    : `<hook_video>not available — pick a video from <recent_videos> and anchor by title only</hook_video>`;

  const workflowsXml =
    qualification.automatableWorkflows.length === 0
      ? `<workflows>none identified — write a softer, more generic version focusing on whatever pain is most visible in <signals></workflows>`
      : `<workflows>
${qualification.automatableWorkflows
  .slice(0, 3)
  .map(
    (w, i) => `  <workflow id="${i + 1}">
    <name>${escapeXml(w.name)}</name>
    <description>${escapeXml(w.description)}</description>
    <automation_approach>${escapeXml(w.automationApproach)}</automation_approach>
    <evidence_quote>${escapeXml(w.evidenceBasis ?? '')}</evidence_quote>
    <evidence_tier>${escapeXml(w.evidenceTier ?? '')}</evidence_tier>
    <product_readiness>${escapeXml(w.productReadiness ?? '')}</product_readiness>
  </workflow>`,
  )
  .join('\n')}
</workflows>`;

  const signalsXml =
    qualification.signals.length === 0
      ? `<signals>none</signals>`
      : `<signals>
${qualification.signals
  .map(
    (s) =>
      `  - [${s.type}] ${escapeXml(s.evidence)}${s.videoId ? ` (${s.videoId})` : ''}`,
  )
  .join('\n')}
</signals>`;

  const objectionsXml =
    qualification.salesObjections.length === 0
      ? `<sales_objections>none provided — be naturally cautious about over-promising</sales_objections>`
      : `<sales_objections>
${qualification.salesObjections.map((o) => `  - ${escapeXml(o)}`).join('\n')}
</sales_objections>`;

  const recentVideosXml = `<recent_videos count="${recentVideos.length}">
${recentVideos
  .map(
    (v, i) =>
      `  <video index="${i + 1}"><title>${escapeXml(v.title)}</title><published>${relativePublished(v.publishedAt)}</published></video>`,
  )
  .join('\n')}
</recent_videos>`;

  return `${channelXml}

${hookXml}

${workflowsXml}

${signalsXml}

${objectionsXml}

${recentVideosXml}

<context_for_tone_only_do_not_quote>
  pitch_angle: ${escapeXml(qualification.pitchAngle ?? '')}
  suggested_solution: ${escapeXml(qualification.suggestedSolution ?? '')}
</context_for_tone_only_do_not_quote>

<task>
Write a single cold outreach email from Martina (HelmStudio) to ${escapeXml(channel.title)}.
Language: ${language}
Follow EVERY rule in the system message without exception.
Output a single JSON object: { "subject": "...", "body": "..." }
</task>`;
}
