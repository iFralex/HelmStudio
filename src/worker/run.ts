#!/usr/bin/env tsx
import { env } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline/run';
import { closeRun } from '@/lib/pipeline/lifecycle';
import { logger } from '@/lib/logger';

let shuttingDown = false;
let activeRunId: number | undefined;

async function handleShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'received shutdown signal');

  try {
    if (activeRunId !== undefined) {
      await closeRun(activeRunId, 'cancelled', `received ${signal}`);
      logger.info({ runId: activeRunId }, 'run cancelled due to signal');
    }
    process.exit(1);
  } catch (err) {
    logger.error({ err }, 'error during shutdown cleanup');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void handleShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void handleShutdown('SIGINT');
});

async function main() {
  // Ensure env is validated at startup
  void env;
  const triggeredBy = process.argv.includes('--manual') ? 'manual' : 'cron';
  logger.info({ triggeredBy }, 'worker starting');
  try {
    const result = await runPipeline({ triggeredBy }, undefined, (runId) => {
      activeRunId = runId;
    });
    logger.info({ result }, 'worker finished');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'worker failed');
    process.exit(1);
  }
}

main();
