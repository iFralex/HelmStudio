'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Channel, Qualification } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { formatCompact, formatRelative, scoreColor } from '@/lib/ui/format';

export interface ChannelsTableProps {
  rows: Array<Channel & { latestQualification: Qualification | null }>;
}

const SCORE_COLOR_CLASSES: Record<'green' | 'yellow' | 'gray', string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
  gray: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function ChannelsTable({ rows }: ChannelsTableProps) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">{copy.channels.columnThumbnail}</TableHead>
          <TableHead>{copy.channels.columnTitle}</TableHead>
          <TableHead className="text-right">{copy.channels.columnSubscribers}</TableHead>
          <TableHead>{copy.channels.columnNiche}</TableHead>
          <TableHead>{copy.channels.columnFormat}</TableHead>
          <TableHead className="text-right">{copy.channels.columnScore}</TableHead>
          <TableHead>{copy.channels.columnPitchLanguage}</TableHead>
          <TableHead>{copy.channels.columnOutreachStatus}</TableHead>
          <TableHead>{copy.channels.columnLastQualified}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const qual = row.latestQualification;
          const color = scoreColor(row.latestAutomationScore);
          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => router.push(`/admin/channels/${row.id}`)}
            >
              <TableCell>
                {row.thumbnailUrl ? (
                  <Image
                    src={row.thumbnailUrl}
                    alt={row.title}
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted" />
                )}
              </TableCell>
              <TableCell className="max-w-xs">
                <div className="font-medium truncate">{row.title}</div>
                {row.handle && (
                  <div className="text-xs text-muted-foreground truncate">{row.handle}</div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.subscriberCount !== null && row.subscriberCount !== undefined
                  ? formatCompact(row.subscriberCount)
                  : '—'}
              </TableCell>
              <TableCell className="max-w-[200px]">
                <span className="truncate block">{qual?.nicheClassification ?? '—'}</span>
              </TableCell>
              <TableCell className="max-w-[150px]">
                <span className="truncate block">{qual?.formatType ?? '—'}</span>
              </TableCell>
              <TableCell className="text-right">
                {row.latestAutomationScore !== null && row.latestAutomationScore !== undefined ? (
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${SCORE_COLOR_CLASSES[color]}`}
                  >
                    {row.latestAutomationScore}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {qual?.pitchLanguage ? (
                  <Badge variant="outline" className="text-xs uppercase">
                    {qual.pitchLanguage}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {copy.outreachStatus[row.outreachStatus]}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.lastQualifiedAt ? formatRelative(row.lastQualifiedAt) : '—'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
