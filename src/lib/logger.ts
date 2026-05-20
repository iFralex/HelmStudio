import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { env } from './env';

function makeProdStreams() {
  const date = new Date().toISOString().slice(0, 10);
  const logsDir = path.join(env.DATA_DIR, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `worker-${date}.log`);
  return pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination({ dest: logFile, append: true, sync: false }) },
  ]);
}

const baseOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'creator-pipeline' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger =
  env.NODE_ENV === 'development'
    ? pino({ ...baseOptions, transport: { target: 'pino-pretty' } })
    : env.NODE_ENV === 'production'
      ? pino(baseOptions, makeProdStreams())
      : pino(baseOptions);

if (env.NODE_ENV === 'production') {
  // Flush async pino buffers before exit; 'exit' fires synchronously so it cannot drain async I/O
  ['SIGTERM', 'SIGINT'].forEach((sig) => {
    process.once(sig, () => {
      logger.flush(() => process.exit(0));
    });
  });
}

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
