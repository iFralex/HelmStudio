import { getDb } from '@/lib/db/client';
import { videoSelections } from '@/lib/db/schema';
import { callLLM, LlmBusinessRuleError, type TokenUsage } from './call';
import { version as promptVersion, system, userTemplate, type SelectInput } from './prompts/select';
import { SelectOutputSchema, validateSelectOutput, type SelectOutput } from './schemas';

type Db = ReturnType<typeof getDb>;

export type { SelectInput };

export async function runVideoSelection(
  args: { channelId: string; runId: number; input: SelectInput },
  db: Db = getDb(),
): Promise<{ selectionId: number; output: SelectOutput; usage: TokenUsage }> {
  const { channelId, runId, input } = args;

  const user = userTemplate(input);

  const result = await callLLM({
    tier: 'think',
    promptVersion,
    system,
    user,
    schema: SelectOutputSchema,
    context: { channelId, runId, kind: 'video_selection' },
  });

  const { parsed: output, usage, latencyMs, modelUsed, rawPath } = result;

  const row = db
    .insert(videoSelections)
    .values({
      channelId,
      runId,
      videoClassifications: output.videoClassifications,
      selectedVideoIds: output.selectedVideoIds,
      formatConsistencySummary: output.formatConsistencySummary,
      selectionRationale: output.selectionRationale,
      modelUsed,
      promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Math.round(latencyMs),
      rawResponsePath: rawPath,
    })
    .returning({ id: videoSelections.id })
    .get()!;

  const validation = validateSelectOutput(output);
  if (!validation.valid) {
    throw new LlmBusinessRuleError(validation.reason, rawPath);
  }

  return { selectionId: row.id, output, usage };
}
