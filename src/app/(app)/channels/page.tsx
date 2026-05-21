import { z } from 'zod';
import Link from 'next/link';
import { listChannelsForUi, ALL_OUTREACH_STATUSES, type ListChannelsFilters, type OutreachStatus } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { ChannelsTable } from '@/components/channels/channels-table';
import { FiltersBar } from '@/components/channels/filters-bar';
import { Button } from '@/components/ui/button';

const ChannelsSearchParamsSchema = z.object({
  status: z.string().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  maxScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  minSubs: z.coerce.number().int().min(0).optional().catch(undefined),
  maxSubs: z.coerce.number().int().min(0).optional().catch(undefined),
  niche: z.string().max(200).optional().catch(undefined),
  format: z.string().max(200).optional().catch(undefined),
  lang: z.enum(['it', 'en']).optional().catch(undefined),
  q: z.string().max(500).optional(),
  sort: z
    .enum(['score_desc', 'subs_desc', 'qualified_at_desc', 'discovered_at_desc'])
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

function toFlat(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
}

function parseFilters(flat: Record<string, string | undefined>): ListChannelsFilters {
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
    pageSize: 50,
  };
}

function buildHref(
  flat: Record<string, string | undefined>,
  overrides: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  const merged = { ...flat, ...overrides };
  for (const [key, val] of Object.entries(merged)) {
    if (val !== undefined && val !== '') {
      params.set(key, String(val));
    }
  }
  const qs = params.toString();
  return qs ? `/channels?${qs}` : '/channels';
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ChannelsPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const flatParams = toFlat(rawParams);
  const filters = parseFilters(flatParams);
  const result = await listChannelsForUi(filters);
  const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));

  const hasFilters = Boolean(
    rawParams.status ||
      rawParams.minScore ||
      rawParams.maxScore ||
      rawParams.minSubs ||
      rawParams.maxSubs ||
      rawParams.niche ||
      rawParams.format ||
      rawParams.lang ||
      rawParams.q,
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{copy.channels.title}</h1>

      <FiltersBar filters={filters} rawParams={flatParams} />

      {result.rows.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-muted-foreground">{copy.channels.noResults}</p>
          {hasFilters && (
            <Link href="/channels">
              <Button variant="outline" size="sm">
                Reset filtri
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <ChannelsTable rows={result.rows} />

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                {copy.channels.pageOf(result.page, totalPages)}
              </p>
              <div className="flex gap-2">
                {result.page > 1 && (
                  <Link href={buildHref(flatParams, { page: result.page - 1 })}>
                    <Button variant="outline" size="sm">
                      {copy.channels.paginationPrev}
                    </Button>
                  </Link>
                )}
                {result.page < totalPages && (
                  <Link href={buildHref(flatParams, { page: result.page + 1 })}>
                    <Button variant="outline" size="sm">
                      {copy.channels.paginationNext}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
