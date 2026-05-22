'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ALL_OUTREACH_STATUSES, type ListChannelsFilters, type OutreachStatus } from '@/lib/db/constants';
import { copy } from '@/lib/ui/copy';

export interface FiltersBarProps {
  filters: ListChannelsFilters;
  rawParams: Record<string, string | undefined>;
}

export function FiltersBar({ filters, rawParams }: FiltersBarProps) {
  const router = useRouter();

  const [searchValue, setSearchValue] = useState(rawParams.q ?? '');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchValue(rawParams.q ?? '');
  }, [rawParams.q]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const buildUrl = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true): string => {
      const params = new URLSearchParams();
      const merged = { ...rawParams, ...updates };
      if (resetPage) delete merged.page;
      for (const [key, val] of Object.entries(merged)) {
        if (val !== undefined && val !== '') {
          params.set(key, val);
        }
      }
      const qs = params.toString();
      return qs ? `/channels?${qs}` : '/channels';
    },
    [rawParams],
  );

  const navigate = useCallback(
    (updates: Record<string, string | undefined>, resetPage = true) => {
      router.replace(buildUrl(updates, resetPage));
    },
    [router, buildUrl],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        navigate({ q: value || undefined });
      }, 300);
    },
    [navigate],
  );

  const toggleOutreachStatus = useCallback(
    (status: OutreachStatus) => {
      const current = filters.outreachStatus ?? [];
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      navigate({ status: next.length ? next.join(',') : undefined });
    },
    [filters.outreachStatus, navigate],
  );

  const selectedStatuses = filters.outreachStatus ?? [];
  const statusLabel =
    selectedStatuses.length === 0
      ? copy.channels.filterOutreachStatus
      : selectedStatuses.length === 1
        ? copy.outreachStatus[selectedStatuses[0]!]
        : `${selectedStatuses.length} stati`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={copy.channels.search}
          value={searchValue}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
        />

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'outline', size: 'default' }))}
          >
            {statusLabel}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{copy.channels.filterOutreachStatus}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_OUTREACH_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={selectedStatuses.includes(status)}
                onCheckedChange={() => toggleOutreachStatus(status)}
              >
                {copy.outreachStatus[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <Input
            key={`minScore-${rawParams.minScore ?? ''}`}
            type="number"
            placeholder={copy.channels.filterMinScore}
            defaultValue={rawParams.minScore ?? ''}
            onBlur={(e) => navigate({ minScore: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate({ minScore: e.currentTarget.value || undefined });
            }}
            className="w-28"
            min={0}
            max={100}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            key={`maxScore-${rawParams.maxScore ?? ''}`}
            type="number"
            placeholder={copy.channels.filterMaxScore}
            defaultValue={rawParams.maxScore ?? ''}
            onBlur={(e) => navigate({ maxScore: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate({ maxScore: e.currentTarget.value || undefined });
            }}
            className="w-28"
            min={0}
            max={100}
          />
        </div>

        <div className="flex items-center gap-1">
          <Input
            key={`minSubs-${rawParams.minSubs ?? ''}`}
            type="number"
            placeholder={copy.channels.filterMinSubs}
            defaultValue={rawParams.minSubs ?? ''}
            onBlur={(e) => navigate({ minSubs: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate({ minSubs: e.currentTarget.value || undefined });
            }}
            className="w-32"
            min={0}
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            key={`maxSubs-${rawParams.maxSubs ?? ''}`}
            type="number"
            placeholder={copy.channels.filterMaxSubs}
            defaultValue={rawParams.maxSubs ?? ''}
            onBlur={(e) => navigate({ maxSubs: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate({ maxSubs: e.currentTarget.value || undefined });
            }}
            className="w-32"
            min={0}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          key={`niche-${rawParams.niche ?? ''}`}
          placeholder={copy.channels.filterNiche}
          defaultValue={rawParams.niche ?? ''}
          onBlur={(e) => navigate({ niche: e.target.value || undefined })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate({ niche: e.currentTarget.value || undefined });
          }}
          className="max-w-[180px]"
        />

        <Input
          key={`format-${rawParams.format ?? ''}`}
          placeholder={copy.channels.filterFormat}
          defaultValue={rawParams.format ?? ''}
          onBlur={(e) => navigate({ format: e.target.value || undefined })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate({ format: e.currentTarget.value || undefined });
          }}
          className="max-w-[180px]"
        />

        <Select
          value={rawParams.lang ?? 'all'}
          onValueChange={(val) =>
            navigate({ lang: !val || val === 'all' ? undefined : val })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.channels.pitchLangAll}</SelectItem>
            <SelectItem value="it">{copy.channels.pitchLangIt}</SelectItem>
            <SelectItem value="en">{copy.channels.pitchLangEn}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={rawParams.sort ?? 'score_desc'}
          onValueChange={(val) => {
            if (val) navigate({ sort: val });
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score_desc">{copy.channels.sortScoreDesc}</SelectItem>
            <SelectItem value="subs_desc">{copy.channels.sortSubsDesc}</SelectItem>
            <SelectItem value="qualified_at_desc">{copy.channels.sortQualifiedDesc}</SelectItem>
            <SelectItem value="discovered_at_desc">{copy.channels.sortDiscoveredDesc}</SelectItem>
          </SelectContent>
        </Select>

        <Link href="/channels">
          <Button variant="ghost" size="sm">
            {copy.channels.clearFilters}
          </Button>
        </Link>
      </div>
    </div>
  );
}
