// Source of truth for case-study slugs. Used by generateStaticParams,
// route validation, and links. Keep in sync with messages.CaseStudies.cases[].slug.
export const CASE_STUDY_SLUGS = ['mai-erklart', 'chase-maker'] as const;
export type CaseStudySlug = (typeof CASE_STUDY_SLUGS)[number];

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
