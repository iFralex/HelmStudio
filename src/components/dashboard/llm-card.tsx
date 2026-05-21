import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCompact } from '@/lib/ui/format';

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
        <CardTitle>LLM oggi</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Chiamate</dt>
            <dd className="font-medium tabular-nums">{stats.callsCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Token input</dt>
            <dd className="font-medium tabular-nums">{formatCompact(stats.inputTokens)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Token output</dt>
            <dd className="font-medium tabular-nums">{formatCompact(stats.outputTokens)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
