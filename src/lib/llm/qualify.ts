import { getDb } from '@/lib/db/client';
import { qualifications } from '@/lib/db/schema';
import { callLLM, type TokenUsage } from './call';
import { version as promptVersion, system, userTemplate, type QualifyInput } from './prompts/qualify';
import { QualifyOutputSchema, type QualifyOutput } from './schemas';
import { truncateMiddle } from './tokens';

type Db = ReturnType<typeof getDb>;

export type { QualifyInput };

const TOTAL_TRANSCRIPT_BUDGET = 20000;
const DEFAULT_TOKENS_PER_TRANSCRIPT = 4000;

export async function runFinalQualification(
  args: {
    channelId: string;
    runId: number;
    videoSelectionId: number;
    input: QualifyInput;
  },
  db: Db = getDb(),
): Promise<{ qualificationId: number; output: QualifyOutput; usage: TokenUsage }> {
  const { channelId, runId, videoSelectionId, input } = args;

  const successfulCount = input.transcripts.length;
  const tokensPerTranscript =
    successfulCount > 0 && successfulCount < 5
      ? Math.floor(TOTAL_TRANSCRIPT_BUDGET / successfulCount)
      : DEFAULT_TOKENS_PER_TRANSCRIPT;

  const truncatedInput: QualifyInput = {
    ...input,
    transcripts: input.transcripts.map((t) => ({
      ...t,
      text: truncateMiddle(t.text, tokensPerTranscript),
    })),
  };

  const user = userTemplate(truncatedInput);

  const result = await callLLM({
    tier: 'think',
    promptVersion,
    system,
    user,
    schema: QualifyOutputSchema,
    context: { channelId, runId, kind: 'qualification' },
  });

  const { parsed: output, usage, latencyMs, modelUsed, rawPath } = result;

  const row = db
    .insert(qualifications)
    .values({
      channelId,
      runId,
      videoSelectionId,
      modelUsed,
      promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Math.round(latencyMs),
      nicheClassification: output.nicheClassification,
      formatType: output.formatType,
      automationPotentialScore: output.automationPotentialScore,
      automatableWorkflows: output.automatableWorkflows,
      suggestedSolution: output.suggestedSolution,
      pitchAngle: output.pitchAngle,
      pitchLanguage: output.pitchLanguage,
      signals: output.signals,
      disqualifiers: output.disqualifiers,
      confidence: output.confidence,
      rationale: output.rationale,
      rawResponsePath: rawPath,
      rawPromptPath: rawPath,
    })
    .returning({ id: qualifications.id })
    .get()!;

  return { qualificationId: row.id, output, usage };
}
