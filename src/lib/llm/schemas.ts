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
