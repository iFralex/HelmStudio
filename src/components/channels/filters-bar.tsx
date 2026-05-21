'use client';

import type { ListChannelsFilters } from '@/lib/db/queries';

export interface FiltersBarProps {
  filters: ListChannelsFilters;
  rawParams: Record<string, string | undefined>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FiltersBar(props: FiltersBarProps) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">Filtri</p>
    </div>
  );
}
