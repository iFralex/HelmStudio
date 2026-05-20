/**
 * Smoke / manual trigger script for the discovery pipeline.
 * Usage: pnpm tsx scripts/run-discovery.ts
 * Requires YOUTUBE_API_KEY and all pipeline env vars in .env.
 * Consumes ~3,200 YouTube quota units against the real API.
 */

import { getDb } from '../src/lib/db/client';
import { pipelineRuns } from '../src/lib/db/schema';
import { runDiscovery } from '../src/lib/pipeline/discovery/run';
import { quotaSummary } from '../src/lib/youtube/dashboard';

async function main() {
  const db = getDb();

  const quotaBefore = await quotaSummary(db);
  console.log(`Quota before: ${quotaBefore.spent}/${quotaBefore.cap} units spent today`);

  const runId = db
    .insert(pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: pipelineRuns.id })
    .get()!.id;

  console.log(`\nStarted pipeline run #${runId}`);

  const summary = await runDiscovery(runId, db);

  const quotaAfter = await quotaSummary(db);
  const consumed = quotaAfter.spent - quotaBefore.spent;

  console.log('\n--- Discovery summary ---');
  console.log(`  Searches performed:           ${summary.searchesPerformed}`);
  console.log(`  Candidate channels found:     ${summary.candidatesFound}`);
  console.log(`  Channels enriched:            ${summary.channelsEnriched}`);
  console.log(`  Channels pre-rejected:        ${summary.channelsPreRejected}`);
  console.log(`  Channels ready for LLM stage: ${summary.channelsReadyForQualification}`);
  console.log('\n--- Quota ---');
  console.log(`  Units consumed this run: ${consumed}`);
  console.log(`  Total today:             ${quotaAfter.spent}/${quotaAfter.cap}`);
  console.log(`  Remaining:               ${quotaAfter.remaining}`);

  if (consumed > 4000) {
    console.warn(`\nWARNING: consumed ${consumed} units — expected ≤4,000 per spec §8.7`);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Discovery run failed:', err);
  process.exit(1);
});
