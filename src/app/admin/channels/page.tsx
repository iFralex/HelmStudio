import Link from 'next/link';
import { listChannelsForUi } from '@/lib/db/queries';
import { parseChannelsFilters } from '@/lib/db/list-channels-filters';
import { copy } from '@/lib/ui/copy';
import { ChannelsTable } from '@/components/channels/channels-table';
import { FiltersBar } from '@/components/channels/filters-bar';
import { Button } from '@/components/ui/button';

function toFlat(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
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
  const filters = parseChannelsFilters(flatParams);
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

  const exportParams = new URLSearchParams();
  for (const [key, val] of Object.entries(flatParams)) {
    if (val !== undefined && val !== '' && key !== 'page') {
      exportParams.set(key, val);
    }
  }
  const exportHref = `/api/channels/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{copy.channels.title}</h1>
        <a href={exportHref} className="text-sm text-muted-foreground hover:text-foreground underline">
          {copy.channels.exportCsv}
        </a>
      </div>

      <FiltersBar filters={filters} rawParams={flatParams} />

      {result.rows.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-muted-foreground">{copy.channels.noResults}</p>
          {hasFilters && (
            <Link href="/channels">
              <Button variant="outline" size="sm">
                {copy.channels.resetFilters}
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <ChannelsTable rows={result.rows} />

          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              {copy.channels.pageOf(result.page, totalPages)}
            </p>
            {totalPages > 1 && (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
