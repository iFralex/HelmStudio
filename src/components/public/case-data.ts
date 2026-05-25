// Source of truth for case-study slugs. Used by generateStaticParams,
// route validation, and links. Keep in sync with messages.CaseStudies.cases[].slug.
export const CASE_STUDY_SLUGS = ['doktor-whatson', 'code-monkey'] as const;
export type CaseStudySlug = (typeof CASE_STUDY_SLUGS)[number];

// Locale-invariant metadata kept in code (not in messages) because URLs don't
// change per language.
//
// Avatars are pulled via unavatar.io, a tiny proxy that returns the real
// YouTube channel avatar given a handle. ChannelAvatar uses next/image with
// `unoptimized`, so no domain whitelist tweak is needed.
//
// Replace these with real client data once the first pilots ship.
export const CASE_METADATA: Record<
  CaseStudySlug,
  { logoUrl: string | null; channelUrl: string }
> = {
  'doktor-whatson': {
    logoUrl: 'https://unavatar.io/youtube/DoktorWhatson',
    channelUrl: 'https://www.youtube.com/@DoktorWhatson',
  },
  'code-monkey': {
    logoUrl: 'https://unavatar.io/youtube/CodeMonkeyUnity',
    channelUrl: 'https://www.youtube.com/@CodeMonkeyUnity',
  },
};

export type CaseStudy = {
  slug: CaseStudySlug;
  channelName: string;
  channelHandle: string;
  tag: string;
  language: string;
  subscribers: string;
  format: string;
  summary: string;
  heroQuote: string;
  heroQuoteOriginalLang: string;
  problem: string;
  solution: string;
  stack: string[];
  metrics: Array<{ label: string; before: string; after: string }>;
  finalQuote: string;
  finalQuoteOriginalLang: string;
  finalQuoteAttribution: string;
};

export function isCaseSlug(s: string): s is CaseStudySlug {
  return (CASE_STUDY_SLUGS as readonly string[]).includes(s);
}
