#!/usr/bin/env tsx
import { env } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline/run';
import { logger } from '@/lib/logger';

async function main() {
  // Ensure env is validated at startup
  void env;
  const triggeredBy = process.argv.includes('--manual') ? 'manual' : 'cron';
  logger.info({ triggeredBy }, 'worker starting');
  try {
    const result = await runPipeline({ triggeredBy });
    logger.info({ result }, 'worker finished');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'worker failed');
    process.exit(1);
  }
}

main();
