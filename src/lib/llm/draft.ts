import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { outreachDrafts } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { callLLM, LlmFormatError, type TokenUsage } from './call';
import { version as promptVersion, system, userTemplate, type DraftInput } from './prompts/draft';
import { DraftOutputSchema, validateDraftOutput, type DraftOutput } from './schemas';

export type { DraftInput };

type Db = ReturnType<typeof getDb>;

const WORD_COUNT_RETRY_MSG =
  'The body was too short/long. Aim for 120-180 words. Reply with the JSON only.';

export async function runDraftGeneration(
  args: {
    channelId: string;
    qualificationId: number;
    input: DraftInput;
  },
  db: Db = getDb(),
): Promise<{ draftId: number; output: DraftOutput; usage: TokenUsage }> {
  const { channelId, qualificationId, input } = args;
  const { language } = input;

  const user = userTemplate(input);

  const result = await callLLM({
    tier: 'fast',
    promptVersion,
    system,
    user,
    schema: DraftOutputSchema,
    context: { channelId, kind: 'draft' },
  });

  let { parsed: output, usage, modelUsed, rawPath } = result;

  if (output.subject.length > 60) {
    logger.warn({ channelId, subjectLength: output.subject.length }, 'draft subject exceeds 60 chars');
  }

  const validation = validateDraftOutput(output, language);
  if (!validation.valid) {
    const retryResult = await callLLM({
      tier: 'fast',
      promptVersion,
      system,
      user: `${user}\n\n${WORD_COUNT_RETRY_MSG}`,
      schema: DraftOutputSchema,
      context: { channelId, kind: 'draft' },
    });

    usage = {
      inputTokens: usage.inputTokens + retryResult.usage.inputTokens,
      outputTokens: usage.outputTokens + retryResult.usage.outputTokens,
    };
    modelUsed = retryResult.modelUsed;
    rawPath = retryResult.rawPath;
    output = retryResult.parsed;

    if (retryResult.parsed.subject.length > 60) {
      logger.warn({ channelId, subjectLength: retryResult.parsed.subject.length }, 'draft subject exceeds 60 chars on retry');
    }

    const retryValidation = validateDraftOutput(retryResult.parsed, language);
    if (!retryValidation.valid) {
      throw new LlmFormatError(
        `Draft body word count out of band after retry: ${retryValidation.reason}`,
        rawPath,
      );
    }
  }

  const draftId = db.transaction((tx) => {
    tx.update(outreachDrafts)
      .set({ isCurrent: false })
      .where(and(eq(outreachDrafts.channelId, channelId), eq(outreachDrafts.isCurrent, true)))
      .run();

    const row = tx
      .insert(outreachDrafts)
      .values({
        channelId,
        qualificationId,
        language,
        subject: output.subject,
        body: output.body,
        modelUsed,
        promptVersion,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        rawResponsePath: rawPath,
        isCurrent: true,
      })
      .returning({ id: outreachDrafts.id })
      .get()!;

    return row.id;
  });

  return { draftId, output, usage };
}
