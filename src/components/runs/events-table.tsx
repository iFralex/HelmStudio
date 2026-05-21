import { type PipelineEvent } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { formatDate } from '@/lib/ui/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STAGE_OPTIONS = ['discovery', 'enrichment', 'filter', 'qualification', 'meta'] as const;

const LEVEL_ROW_CLASSES: Record<string, string> = {
  info: '',
  warn: 'text-yellow-700 dark:text-yellow-400',
  error: 'text-red-700 dark:text-red-400',
};

interface EventsTableProps {
  events: Array<PipelineEvent & { channelTitle: string | null }>;
  currentStage: string | undefined;
  currentChannelId: string | undefined;
  runId: number;
}

export function EventsTable({
  events,
  currentStage,
  currentChannelId,
  runId,
}: EventsTableProps) {
  return (
    <div className="space-y-4">
      <form method="get" action={`/runs/${runId}`} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {copy.runs.eventColumnStage}
          </label>
          <select
            name="stage"
            defaultValue={currentStage ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{copy.runs.filterAll}</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">
            {copy.runs.eventColumnChannel}
          </label>
          <input
            type="text"
            name="channelId"
            defaultValue={currentChannelId ?? ''}
            placeholder={copy.runs.channelIdPlaceholder}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          {copy.runs.filterApply}
        </button>

        {(currentStage || currentChannelId) && (
          <a
            href={`/runs/${runId}`}
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {copy.runs.filterReset}
          </a>
        )}
      </form>

      {events.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{copy.runs.noEvents}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">{copy.runs.eventColumnTime}</TableHead>
              <TableHead className="w-28">{copy.runs.eventColumnStage}</TableHead>
              <TableHead>{copy.runs.eventColumnEvent}</TableHead>
              <TableHead className="w-44">{copy.runs.eventColumnChannel}</TableHead>
              <TableHead>{copy.runs.eventColumnDetails}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((ev) => (
              <TableRow key={ev.id} className={LEVEL_ROW_CLASSES[ev.level]}>
                <TableCell className="text-xs">
                  <span title={formatDate(ev.createdAt)}>{formatDate(ev.createdAt)}</span>
                </TableCell>
                <TableCell className="text-xs">{ev.stage}</TableCell>
                <TableCell className="text-xs">{ev.event}</TableCell>
                <TableCell className="text-xs">
                  {ev.channelTitle ?? ev.channelId ?? '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {ev.details != null ? (
                    <details>
                      <summary className="line-clamp-2 cursor-pointer font-mono">
                        {JSON.stringify(ev.details)}
                      </summary>
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-1.5 font-mono whitespace-pre-wrap">
                        {JSON.stringify(ev.details, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
