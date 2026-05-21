import { copy } from '@/lib/ui/copy';

interface Props {
  modelThink: string;
  modelFast: string;
  llmBaseUrl: string;
}

export function ModelsSection({ modelThink, modelFast, llmBaseUrl }: Props) {
  const rows: [string, string][] = [
    [copy.settings.modelThink, modelThink],
    [copy.settings.modelFast, modelFast],
    [copy.settings.llmBaseUrl, llmBaseUrl],
  ];

  return (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-52 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="font-mono break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Modificare nel file <code className="font-mono">.env</code> e riavviare il worker.
      </p>
    </div>
  );
}
