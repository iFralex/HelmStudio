import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getRunById, listEventsForRun } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { formatDate, formatNumber, formatRelative, statusColor, STATUS_COLOR_CLASSES } from '@/lib/ui/format';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EventsTable } from '@/components/runs/events-table';
import { RunPoller } from './run-poller';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RunDetailPage({ params, searchParams }: PageProps) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const run = await getRunById(id);
  if (!run) notFound();

  const sp = await searchParams;
  const stage = Array.isArray(sp.stage) ? sp.stage[0] : sp.stage;
  const channelId = Array.isArray(sp.channelId) ? sp.channelId[0] : sp.channelId;

  const events = await listEventsForRun(id, { stage, channelId });

  const color = statusColor(run.status);

  const duration =
    run.finishedAt !== null && run.finishedAt !== undefined
      ? Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)
      : null;

  const counters = [
    { label: copy.runs.counterSearches, value: run.searchesPerformed },
    { label: copy.runs.counterCandidates, value: run.candidatesFound },
    { label: copy.runs.counterEnriched, value: run.channelsEnriched },
    { label: copy.runs.counterPreRejected, value: run.channelsPreRejected },
    { label: copy.runs.counterQualified, value: run.channelsQualified },
    { label: copy.runs.counterPostRejected, value: run.channelsPostRejected },
    { label: copy.runs.counterQuota, value: run.youtubeQuotaUsed },
    { label: copy.runs.counterLlmCalls, value: run.llmCallsCount },
    { label: copy.runs.counterLlmTokensInput, value: run.llmTokensInput },
    { label: copy.runs.counterLlmTokensOutput, value: run.llmTokensOutput },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="space-y-1">
        <Link
          href="/runs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {copy.runs.backToRuns}
        </Link>
        <h1 className="text-2xl font-semibold">{copy.runs.runDetailTitle(id)}</h1>
      </div>

      {run.status === 'running' && <RunPoller />}

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR_CLASSES[color]}`}
          >
            {copy.runs.statusLabel[run.status]}
          </span>
          <Badge variant="secondary">{copy.runs.triggeredByLabel[run.triggeredBy]}</Badge>
          <div className="text-sm">
            <span className="text-muted-foreground">{copy.runs.columnStartedAt}: </span>
            <span title={formatDate(run.startedAt)}>{formatRelative(run.startedAt)}</span>
          </div>
          {run.finishedAt && (
            <div className="text-sm">
              <span className="text-muted-foreground">{copy.runs.columnFinishedAt}: </span>
              <span title={formatDate(run.finishedAt)}>{formatRelative(run.finishedAt)}</span>
            </div>
          )}
          {duration !== null && (
            <div className="text-sm text-muted-foreground">
              {copy.runs.durationLabel(duration)}
            </div>
          )}
        </div>
      </div>

      {run.errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="font-medium text-destructive">{copy.runs.errorTitle}</p>
          <p className="mt-1 text-sm text-destructive/80">{run.errorMessage}</p>
          {run.errorStack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-destructive/70 hover:underline">
                {copy.runs.errorStackTrace}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive/80">
                {run.errorStack}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{copy.runs.countersTitle}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {counters.map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(value)}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{copy.runs.eventsTitle}</h2>
        <EventsTable
          events={events}
          currentStage={stage}
          currentChannelId={channelId}
          runId={id}
        />
      </div>
    </div>
  );
}
