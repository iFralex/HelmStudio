import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { copy } from '@/lib/ui/copy';
import type { quotaSummary } from '@/lib/youtube/dashboard';

type QuotaSummary = Awaited<ReturnType<typeof quotaSummary>>;

interface QuotaCardProps {
  quota: QuotaSummary;
}

export function QuotaCard({ quota }: QuotaCardProps) {
  const pct = quota.cap > 0 ? Math.min(100, Math.round((quota.spent / quota.cap) * 100)) : 0;

  const tooltipLines = Object.entries(quota.byOperation)
    .filter(([, v]) => v > 0)
    .map(([op, v]) => `${op}: ${v.toLocaleString('it-IT')}`)
    .join('\n');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.dashboard.quotaToday}</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="w-full text-left">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {copy.dashboard.unitsUsed(quota.spent, quota.cap)}
                </p>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="text-xs whitespace-pre">
                {tooltipLines || 'Nessun utilizzo oggi'}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
