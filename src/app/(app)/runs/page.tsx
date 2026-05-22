import Link from 'next/link';
import { listRuns } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { formatCompact, formatDateTime, formatRelative, statusColor, STATUS_COLOR_CLASSES } from '@/lib/ui/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RunsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const beforeRaw = Array.isArray(raw.before) ? raw.before[0] : raw.before;
  const beforeNum = beforeRaw !== undefined ? Number(beforeRaw) : undefined;
  const before = beforeNum !== undefined && !Number.isNaN(beforeNum) ? beforeNum : undefined;

  const runs = await listRuns({ limit: 50, before });

  const earliestStartedAt = runs.at(-1)?.startedAt.getTime();

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{copy.runs.title}</h1>

      {runs.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{copy.runs.emptyState}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{copy.runs.columnId}</TableHead>
                <TableHead>{copy.runs.columnStartedAt}</TableHead>
                <TableHead>{copy.runs.columnFinishedAt}</TableHead>
                <TableHead>{copy.runs.columnTriggeredBy}</TableHead>
                <TableHead>{copy.runs.columnStatus}</TableHead>
                <TableHead className="text-right">{copy.runs.columnCandidates}</TableHead>
                <TableHead className="text-right">{copy.runs.columnQualified}</TableHead>
                <TableHead className="text-right">{copy.runs.columnQuota}</TableHead>
                <TableHead className="text-right">{copy.runs.columnLlmTokens}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const color = statusColor(run.status);
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link href={`/runs/${run.id}`} className="text-primary hover:underline">
                        {run.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span title={formatDateTime(run.startedAt)}>
                        {formatRelative(run.startedAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {run.finishedAt ? (
                        <span title={formatDateTime(run.finishedAt)}>
                          {formatRelative(run.finishedAt)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {copy.runs.triggeredByLabel[run.triggeredBy]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR_CLASSES[color]}`}
                      >
                        {copy.runs.statusLabel[run.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCompact(run.candidatesFound)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCompact(run.channelsQualified)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCompact(run.youtubeQuotaUsed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCompact(run.llmTokensInput + run.llmTokensOutput)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {runs.length === 50 && earliestStartedAt !== undefined && (
            <div className="flex justify-center pt-4">
              <Link href={`/runs?before=${earliestStartedAt}`}>
                <Button variant="outline" size="sm">
                  {copy.runs.loadPrevious}
                </Button>
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
