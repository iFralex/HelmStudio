import { z } from 'zod';

export const VideoClassificationSchema = z.object({
  videoId: z.string(),
  classification: z.enum(['format_anchor', 'representative', 'extemporaneous', 'outlier']),
  reasoning: z.string(),
  automationRelevanceScore: z.number().int().min(0).max(10),
});

export const SelectOutputSchema = z.object({
  videoClassifications: z.array(VideoClassificationSchema).length(20),
  formatConsistencySummary: z.string(),
  selectedVideoIds: z.array(z.string()).min(3).max(5),
  selectionRationale: z.string(),
});

export type SelectOutput = z.infer<typeof SelectOutputSchema>;

export function validateSelectOutput(
  output: SelectOutput,
): { valid: true } | { valid: false; reason: string } {
  const classifiedIds = new Set(output.videoClassifications.map((v) => v.videoId));
  const missing = output.selectedVideoIds.filter((id) => !classifiedIds.has(id));
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `selectedVideoIds contains IDs not present in videoClassifications: ${missing.join(', ')}`,
    };
  }
  return { valid: true };
}

export const AutomatableWorkflowSchema = z.object({
  name: z.string(),
  description: z.string(),
  automationApproach: z.string(),
  evidenceTier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']),
  evidenceBasis: z.string(),
  estimatedTimeSavedPerVideoMinutes: z.number().int().nonnegative(),
  timeSavedReasoning: z.string(),
  productReadiness: z.enum(['off_the_shelf', 'buildable_6mo', 'research_phase']),
});

export const SignalSchema = z.object({
  type: z.enum(['positive', 'negative']),
  evidence: z.string(),
  videoId: z.string().nullable(),
});

export const QualifyScoresSchema = z.object({
  workflowRepeatability: z.number().int().min(0).max(100),
  evidenceStrength: z.number().int().min(0).max(100),
  commercialViability: z.number().int().min(0).max(100),
  final: z.number().int().min(0).max(100),
});

export const QualifyOutputSchema = z.object({
  nicheClassification: z.string(),
  formatType: z.string(),
  scores: QualifyScoresSchema,
  analysisMode: z.enum(['evidence_driven', 'inferred']),
  analysisModeReasoning: z.string(),
  automatableWorkflows: z.array(AutomatableWorkflowSchema).max(5),
  suggestedSolution: z.string(),
  pitchAngle: z.string(),
  signals: z.array(SignalSchema).min(4).max(15),
  disqualifiers: z.array(z.string()),
  disqualifierScoreImpact: z.string(),
  salesObjections: z.array(z.string()).min(1).max(3),
  confidence: z.number().min(0).max(100),
  rationale: z.string(),
  creatorFirstName: z.string().nullable().describe(
    'The creator\'s real first name if mentioned in transcripts, channel description, or any provided data. Use proper capitalization (e.g. "Marco", "Ilenia"). Null if not found.',
  ),
});

export type QualifyOutput = z.infer<typeof QualifyOutputSchema>;

export function validateQualifyOutput(
  output: QualifyOutput,
): { valid: true } | { valid: false; reason: string } {
  const { scores, automatableWorkflows, analysisMode, disqualifiers } = output;

  // Copyright / third-party disqualifier → commercialViability must be < 40
  const hasCopyrightDisqualifier = disqualifiers.some((d) =>
    /copyright|third.party|terzi/i.test(d),
  );
  if (hasCopyrightDisqualifier && scores.commercialViability >= 40) {
    return {
      valid: false,
      reason: `Copyright/third-party disqualifier present but commercialViability is ${scores.commercialViability} (must be < 40)`,
    };
  }

  // final > 75 requires at least one TIER_1 workflow
  const hasTier1 = automatableWorkflows.some((w) => w.evidenceTier === 'TIER_1');
  if (scores.final > 75 && !hasTier1) {
    return {
      valid: false,
      reason: `final score ${scores.final} > 75 requires at least one TIER_1 workflow (none found)`,
    };
  }

  // analysisMode=inferred → final must be < 60
  if (analysisMode === 'inferred' && scores.final >= 60) {
    return {
      valid: false,
      reason: `analysisMode=inferred requires final score < 60, got ${scores.final}`,
    };
  }

  // no workflows → final must be < 45
  if (automatableWorkflows.length === 0 && scores.final >= 45) {
    return {
      valid: false,
      reason: `No automatable workflows requires final score < 45, got ${scores.final}`,
    };
  }

  return { valid: true };
}

export const AdvocateOutputSchema = z.object({
  approved: z.boolean(),
  revisedFinal: z.number().int().min(0).max(100).nullable(),
  concerns: z.array(z.string()),
});

export type AdvocateOutput = z.infer<typeof AdvocateOutputSchema>;

export const DraftOutputSchema = z.object({
  subject: z.string().min(5).max(80), // hard cap > 60 to allow minor overruns
  body: z.string().min(1).max(3000),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export function validateDraftOutput(
  d: DraftOutput,
): { valid: true } | { valid: false; reason: string } {
  const trimmed = d.body.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  if (wordCount < 80 || wordCount > 250) {
    return {
      valid: false,
      reason: `Body word count is ${wordCount}, expected between 80 and 250 words.`,
    };
  }
  return { valid: true };
}
