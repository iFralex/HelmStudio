import { getFilters, getPipelineConfig } from '@/lib/services/settings';
import { listKeywords } from '@/lib/db/queries';
import { env } from '@/lib/env';
import { copy } from '@/lib/ui/copy';
import { Separator } from '@/components/ui/separator';
import { version as selectVersion } from '@/lib/llm/prompts/select';
import { version as qualifyVersion } from '@/lib/llm/prompts/qualify';
import { version as draftVersion } from '@/lib/llm/prompts/draft';
import { FiltersForm } from '@/components/settings/filters-form';
import { PipelineConfigForm } from '@/components/settings/pipeline-config-form';
import { KeywordsSection } from '@/components/settings/keywords-section';

export default async function SettingsPage() {
  const [filters, pipelineConfig, keywords] = await Promise.all([
    getFilters(),
    getPipelineConfig(),
    listKeywords(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-10">
      <h1 className="text-2xl font-semibold">{copy.settings.title}</h1>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{copy.settings.filtersTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.settings.filtersDescription}</p>
        </div>
        <FiltersForm filters={filters} />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{copy.settings.pipelineConfigTitle}</h2>
        <PipelineConfigForm config={pipelineConfig} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{copy.settings.keywordsTitle}</h2>
          <p className="text-sm text-muted-foreground">{copy.settings.keywordsDescription}</p>
        </div>
        <KeywordsSection keywords={keywords} />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{copy.settings.modelsTitle}</h2>
        <dl className="space-y-2 text-sm">
          {(
            [
              [copy.settings.modelThink, env.LLM_MODEL_THINK],
              [copy.settings.modelFast, env.LLM_MODEL_FAST],
              [copy.settings.llmBaseUrl, env.LLM_BASE_URL],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-52 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Modificare nel file <code className="font-mono">.env</code> e riavviare il worker.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{copy.settings.promptsTitle}</h2>
        <dl className="space-y-2 text-sm">
          {(
            [
              [copy.settings.promptSelect, selectVersion],
              [copy.settings.promptQualify, qualifyVersion],
              [copy.settings.promptDraft, draftVersion],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-52 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          I prompt sono versionati nel codice (
          <code className="font-mono">src/lib/llm/prompts/</code>).
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{copy.settings.exportTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.settings.exportDescription}</p>
        <a
          href="/api/channels/export"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          {copy.settings.exportButton}
        </a>
      </section>
    </div>
  );
}
