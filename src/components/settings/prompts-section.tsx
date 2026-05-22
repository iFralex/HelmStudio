import { copy } from '@/lib/ui/copy';

interface Props {
  selectVersion: string;
  qualifyVersion: string;
  draftVersion: string;
}

export function PromptsSection({ selectVersion, qualifyVersion, draftVersion }: Props) {
  const rows: [string, string][] = [
    [copy.settings.promptSelect, selectVersion],
    [copy.settings.promptQualify, qualifyVersion],
    [copy.settings.promptDraft, draftVersion],
  ];

  return (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-52 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{copy.settings.promptsFootnote}</p>
    </div>
  );
}
