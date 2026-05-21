/**
 * Smoke / manual trigger script for outreach draft generation.
 * Usage: pnpm tsx scripts/draft-one.ts <channelId>
 * Requires a channelId already present in the DB and qualified (run after qualify-one.ts).
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db/client';
import { outreachDrafts } from '../src/lib/db/schema';
import { generateDraftForChannel } from '../src/lib/services/outreach';

async function main() {
  const channelId = process.argv[2];
  if (!channelId) {
    console.error('Usage: pnpm tsx scripts/draft-one.ts <channelId>');
    process.exit(1);
  }

  const db = getDb();

  console.log(`\nGenerating outreach draft for channel: ${channelId}`);

  const start = Date.now();
  const result = await generateDraftForChannel(channelId, db);
  const elapsed = Date.now() - start;

  const draft = db
    .select()
    .from(outreachDrafts)
    .where(eq(outreachDrafts.id, result.draftId))
    .get();

  console.log(`\n--- Draft #${result.draftId} ---`);
  console.log(`Language:  ${result.language}`);
  console.log(`\nSubject: ${result.subject}`);
  console.log(`\nBody:\n${result.body}`);

  if (draft) {
    console.log(`\n--- Stats ---`);
    console.log(`Model:         ${draft.modelUsed}`);
    console.log(`Prompt:        ${draft.promptVersion}`);
    console.log(`Input tokens:  ${draft.inputTokens ?? 'n/a'}`);
    console.log(`Output tokens: ${draft.outputTokens ?? 'n/a'}`);
    console.log(`Raw path:      ${draft.rawResponsePath}`);
  }

  console.log(`Latency:       ${elapsed} ms`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Draft-one script failed:', err);
  process.exit(1);
});
