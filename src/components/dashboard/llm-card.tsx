import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCompact } from '@/lib/ui/format';
import { copy } from '@/lib/ui/copy';

interface LlmStats {
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
}

interface LlmCardProps {
  stats: LlmStats;
}

export function LlmCard({ stats }: LlmCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.dashboard.llmToday}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{copy.dashboard.llmCalls}</dt>
            <dd className="font-medium tabular-nums">{stats.callsCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{copy.dashboard.llmTokensInput}</dt>
            <dd className="font-medium tabular-nums">{formatCompact(stats.inputTokens)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{copy.dashboard.llmTokensOutput}</dt>
            <dd className="font-medium tabular-nums">{formatCompact(stats.outputTokens)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
