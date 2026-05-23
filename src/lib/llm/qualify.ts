import { getDb } from '@/lib/db/client';
import { qualifications } from '@/lib/db/schema';
import { callLLM, type TokenUsage } from './call';
import { version as promptVersion, system, userTemplate, type QualifyInput } from './prompts/qualify';
import {
  version as advocateVersion,
  system as advocateSystem,
  userTemplate as advocateUserTemplate,
} from './prompts/advocate';
import {
  QualifyOutputSchema,
  AdvocateOutputSchema,
  validateQualifyOutput,
  type QualifyOutput,
} from './schemas';
import { truncateMiddle } from './tokens';
import { LlmBusinessRuleError } from './call';
import { logger } from '@/lib/logger';

type Db = ReturnType<typeof getDb>;

export type { QualifyInput };

const TOTAL_TRANSCRIPT_BUDGET = 20000;
const DEFAULT_TOKENS_PER_TRANSCRIPT = 4000;
const ADVOCATE_SCORE_THRESHOLD = 75;

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

  // Hard post-processing constraints
  const validation = validateQualifyOutput(output);
  if (!validation.valid) {
    throw new LlmBusinessRuleError(validation.reason, rawPath);
  }

  // Devil's advocate review for high-scoring channels
  let advocateApproved: boolean | null = null;
  let advocateRevisedFinal: number | null = null;
  let advocateConcerns: string[] | null = null;
  let totalUsage = usage;

  if (output.scores.final > ADVOCATE_SCORE_THRESHOLD) {
    try {
      const advocateUser = advocateUserTemplate({
        channelId,
        channelTitle: input.channel.title,
        subscriberCount: input.channel.subscriberCount ?? null,
        qualification: output,
      });

      const advocateResult = await callLLM({
        tier: 'fast',
        promptVersion: advocateVersion,
        system: advocateSystem,
        user: advocateUser,
        schema: AdvocateOutputSchema,
        context: { channelId, runId, kind: 'qualification' },
      });

      const adv = advocateResult.parsed;
      advocateApproved = adv.approved;
      advocateRevisedFinal = adv.revisedFinal;
      advocateConcerns = adv.concerns;

      // Accumulate token usage
      totalUsage = {
        inputTokens: usage.inputTokens + advocateResult.usage.inputTokens,
        outputTokens: usage.outputTokens + advocateResult.usage.outputTokens,
        costUsd:
          usage.costUsd !== null && advocateResult.usage.costUsd !== null
            ? usage.costUsd + advocateResult.usage.costUsd
            : null,
      };

      if (!adv.approved) {
        logger.info(
          { channelId, originalFinal: output.scores.final, revisedFinal: adv.revisedFinal },
          'advocate review rejected high score',
        );
      }
    } catch (err) {
      logger.warn({ channelId, err }, 'advocate review failed, proceeding without it');
    }
  }

  // Use advocate's revised score if it rejected the original
  const storedScore =
    advocateApproved === false && advocateRevisedFinal !== null
      ? advocateRevisedFinal
      : output.scores.final;

  const row = db
    .insert(qualifications)
    .values({
      channelId,
      runId,
      videoSelectionId,
      modelUsed,
      promptVersion,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      costUsd: totalUsage.costUsd,
      latencyMs: Math.round(latencyMs),
      nicheClassification: output.nicheClassification,
      formatType: output.formatType,
      automationPotentialScore: storedScore,
      workflowRepeatabilityScore: output.scores.workflowRepeatability,
      evidenceStrengthScore: output.scores.evidenceStrength,
      commercialViabilityScore: output.scores.commercialViability,
      analysisMode: output.analysisMode,
      automatableWorkflows: output.automatableWorkflows,
      suggestedSolution: output.suggestedSolution,
      pitchAngle: output.pitchAngle,
      pitchLanguage: 'en',
      signals: output.signals,
      disqualifiers: output.disqualifiers,
      disqualifierScoreImpact: output.disqualifierScoreImpact,
      salesObjections: output.salesObjections,
      confidence: output.confidence,
      rationale: output.rationale,
      advocateApproved,
      advocateRevisedFinal,
      advocateConcerns,
      rawResponsePath: rawPath,
      rawPromptPath: rawPath,
    })
    .returning({ id: qualifications.id })
    .get()!;

  // Return the output with the potentially revised score so callers see the final stored value
  const returnedOutput: QualifyOutput = {
    ...output,
    scores: { ...output.scores, final: storedScore },
  };

  return { qualificationId: row.id, output: returnedOutput, usage: totalUsage };
}
