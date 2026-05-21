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
  estimatedTimeSavedPerVideoMinutes: z.number().int().nonnegative(),
});

export const SignalSchema = z.object({
  type: z.enum(['positive', 'negative']),
  evidence: z.string(),
  videoId: z.string().nullable(),
});

export const QualifyOutputSchema = z.object({
  nicheClassification: z.string(),
  formatType: z.string(),
  automationPotentialScore: z.number().int().min(0).max(100),
  automatableWorkflows: z.array(AutomatableWorkflowSchema).max(5),
  suggestedSolution: z.string(),
  pitchAngle: z.string(),
  pitchLanguage: z.enum(['it', 'en']),
  signals: z.array(SignalSchema).min(2).max(8),
  disqualifiers: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export type QualifyOutput = z.infer<typeof QualifyOutputSchema>;
