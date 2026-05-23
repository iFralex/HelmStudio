import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { qualifications, videoSelections, outreachDrafts } from '../db/schema';

type Db = ReturnType<typeof getDb>;

export type LlmRunStats = {
  callsCount: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  costUsd: number | null;
};

export async function llmStatsForRun(runId: number, db: Db = getDb()): Promise<LlmRunStats> {
  const vsRows = db
    .select({
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${videoSelections.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${videoSelections.outputTokens}), 0)`,
      totalLatency: sql<number>`coalesce(sum(${videoSelections.latencyMs}), 0)`,
      costUsd: sql<number | null>`sum(${videoSelections.costUsd})`,
    })
    .from(videoSelections)
    .where(eq(videoSelections.runId, runId))
    .all();

  const qualRows = db
    .select({
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${qualifications.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${qualifications.outputTokens}), 0)`,
      totalLatency: sql<number>`coalesce(sum(${qualifications.latencyMs}), 0)`,
      costUsd: sql<number | null>`sum(${qualifications.costUsd})`,
    })
    .from(qualifications)
    .where(eq(qualifications.runId, runId))
    .all();

  // outreach_drafts have no runId; join through qualifications
  const draftRows = db
    .select({
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${outreachDrafts.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${outreachDrafts.outputTokens}), 0)`,
      totalLatency: sql<number>`0`,
      costUsd: sql<number | null>`sum(${outreachDrafts.costUsd})`,
    })
    .from(outreachDrafts)
    .innerJoin(qualifications, eq(outreachDrafts.qualificationId, qualifications.id))
    .where(eq(qualifications.runId, runId))
    .all();

  const sources = [vsRows[0], qualRows[0], draftRows[0]];
  let callsCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalLatency = 0;
  let costUsd: number | null = null;

  for (const row of sources) {
    if (!row) continue;
    callsCount += Number(row.calls);
    inputTokens += Number(row.inputTokens);
    outputTokens += Number(row.outputTokens);
    totalLatency += Number(row.totalLatency);
    if (row.costUsd != null) costUsd = (costUsd ?? 0) + Number(row.costUsd);
  }

  const avgLatencyMs = callsCount > 0 ? totalLatency / callsCount : 0;

  return { callsCount, inputTokens, outputTokens, avgLatencyMs, costUsd };
}
