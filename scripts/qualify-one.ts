/**
 * Smoke / manual trigger script for the qualification pipeline.
 * Usage: pnpm tsx scripts/qualify-one.ts <channelId>
 * Requires a channelId already present in the DB (run after plan 07's smoke).
 * Forces re-qualification, bypassing the requalifyAfterDays window.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db/client';
import { pipelineRuns, qualifications, videoSelections } from '../src/lib/db/schema';
import { qualifyChannel } from '../src/lib/pipeline/qualification/qualify-channel';

async function main() {
  const channelId = process.argv[2];
  if (!channelId) {
    console.error('Usage: pnpm tsx scripts/qualify-one.ts <channelId>');
    process.exit(1);
  }

  const db = getDb();

  console.log(`\nQualifying channel: ${channelId}`);

  const runRow = db
    .insert(pipelineRuns)
    .values({ triggeredBy: 'manual' })
    .returning({ id: pipelineRuns.id })
    .get()!;
  const runId = runRow.id;

  console.log(`Pipeline run #${runId}`);

  const start = Date.now();
  const result = await qualifyChannel({ channelId, runId, force: true }, db);
  const elapsed = Date.now() - start;

  console.log(`\nResult: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);

  if (result.status !== 'qualified' || !result.qualificationId) {
    db.update(pipelineRuns)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
      .run();
    console.log('\nChannel was not qualified. Exiting.');
    process.exit(0);
  }

  db.update(pipelineRuns)
    .set({ status: 'completed', finishedAt: new Date() })
    .where(eq(pipelineRuns.id, runId))
    .run();

  const selection = db
    .select()
    .from(videoSelections)
    .where(eq(videoSelections.runId, runId))
    .get();

  if (selection) {
    console.log('\n--- Step 1: Video Selection ---');
    console.log(`  Model:         ${selection.modelUsed}`);
    console.log(`  Prompt:        ${selection.promptVersion}`);
    console.log(`  Input tokens:  ${selection.inputTokens ?? 'n/a'}`);
    console.log(`  Output tokens: ${selection.outputTokens ?? 'n/a'}`);
    console.log(`  Latency:       ${selection.latencyMs ?? 'n/a'} ms`);
    const selectedIds = selection.selectedVideoIds as string[];
    console.log(`  Selected IDs:  ${selectedIds.join(', ')}`);
    console.log(`  Rationale:     ${selection.selectionRationale}`);
  }

  const qual = db
    .select()
    .from(qualifications)
    .where(eq(qualifications.id, result.qualificationId))
    .get();

  if (qual) {
    console.log('\n--- Step 3: Final Qualification ---');
    console.log(`  Model:         ${qual.modelUsed}`);
    console.log(`  Prompt:        ${qual.promptVersion}`);
    console.log(`  Input tokens:  ${qual.inputTokens ?? 'n/a'}`);
    console.log(`  Output tokens: ${qual.outputTokens ?? 'n/a'}`);
    console.log(`  Latency:       ${qual.latencyMs ?? 'n/a'} ms`);
    console.log('\n  QualifyOutput:');
    console.log(`  nicheClassification:      ${qual.nicheClassification}`);
    console.log(`  formatType:               ${qual.formatType}`);
    console.log(`  automationPotentialScore: ${qual.automationPotentialScore}`);
    console.log(`  confidence:               ${qual.confidence}`);
    console.log(`  pitchLanguage:            ${qual.pitchLanguage}`);
    console.log(`  suggestedSolution:        ${qual.suggestedSolution}`);
    console.log(`  pitchAngle:               ${qual.pitchAngle}`);
    console.log(`  rationale:                ${qual.rationale}`);

    const workflows = qual.automatableWorkflows as Array<{
      name: string;
      description: string;
      automationApproach: string;
      estimatedTimeSavedPerVideoMinutes: number;
    }> | null;
    if (workflows?.length) {
      console.log(`\n  Automatable workflows (${workflows.length}):`);
      for (const wf of workflows) {
        console.log(`    - ${wf.name} (${wf.estimatedTimeSavedPerVideoMinutes} min/video saved)`);
        console.log(`      ${wf.description}`);
      }
    }

    const signals = qual.signals as Array<{
      type: string;
      evidence: string;
      videoId: string | null;
    }> | null;
    if (signals?.length) {
      console.log(`\n  Signals (${signals.length}):`);
      for (const s of signals) {
        console.log(`    [${s.type}] ${s.evidence}${s.videoId ? ` (video: ${s.videoId})` : ''}`);
      }
    }

    const disqualifiers = qual.disqualifiers as string[] | null;
    if (disqualifiers?.length) {
      console.log(`\n  Disqualifiers:`);
      for (const d of disqualifiers) {
        console.log(`    - ${d}`);
      }
    }
  }

  console.log(`\nTotal elapsed: ${elapsed} ms`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Qualify-one script failed:', err);
  process.exit(1);
});
