import { z } from 'zod';
import { ALL_OUTREACH_STATUSES, type ListChannelsFilters, type OutreachStatus } from './queries';

export const ChannelsSearchParamsSchema = z.object({
  status: z.string().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  maxScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  minSubs: z.coerce.number().int().min(0).optional().catch(undefined),
  maxSubs: z.coerce.number().int().min(0).optional().catch(undefined),
  niche: z.string().max(200).optional().catch(undefined),
  format: z.string().max(200).optional().catch(undefined),
  lang: z.enum(['it', 'en']).optional().catch(undefined),
  q: z.string().max(500).optional().catch(undefined),
  sort: z
    .enum(['score_desc', 'subs_desc', 'qualified_at_desc', 'discovered_at_desc'])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export function parseChannelsFilters(
  flat: Record<string, string | undefined>,
  pageSize = 50,
): ListChannelsFilters {
  const parsed = ChannelsSearchParamsSchema.parse(flat);

  const outreachStatus = parsed.status
    ? parsed.status
        .split(',')
        .filter((s): s is OutreachStatus => ALL_OUTREACH_STATUSES.includes(s as OutreachStatus))
    : undefined;

  return {
    outreachStatus: outreachStatus?.length ? outreachStatus : undefined,
    minScore: parsed.minScore,
    maxScore: parsed.maxScore,
    minSubs: parsed.minSubs,
    maxSubs: parsed.maxSubs,
    nicheContains: parsed.niche,
    formatContains: parsed.format,
    pitchLanguage: parsed.lang,
    search: parsed.q,
    sort: parsed.sort ?? 'score_desc',
    page: parsed.page ?? 1,
    pageSize,
  };
}
