import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface LlmStats {
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
}

interface LlmCardProps {
  stats: LlmStats;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
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
            <dd className="font-medium tabular-nums">{fmt(stats.inputTokens)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Token output</dt>
            <dd className="font-medium tabular-nums">{fmt(stats.outputTokens)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
