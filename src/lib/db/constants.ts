export type OutreachStatus =
  | 'none'
  | 'email_added'
  | 'drafted'
  | 'sent'
  | 'replied'
  | 'no_reply'
  | 'ignored';

export type ListChannelsFilters = {
  outreachStatus?: OutreachStatus[];
  minScore?: number;
  maxScore?: number;
  minSubs?: number;
  maxSubs?: number;
  nicheContains?: string;
  formatContains?: string;
  pitchLanguage?: 'it' | 'en';
  search?: string;
  sort?: 'score_desc' | 'subs_desc' | 'qualified_at_desc' | 'discovered_at_desc';
  page?: number;
  pageSize?: number;
};

export const ALL_OUTREACH_STATUSES: OutreachStatus[] = [
  'none',
  'email_added',
  'drafted',
  'sent',
  'replied',
  'no_reply',
  'ignored',
];
