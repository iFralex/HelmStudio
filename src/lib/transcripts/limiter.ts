import pLimit from 'p-limit';

const limit = pLimit(2); // max 2 concurrent timedtext fetches
const DELAY_BETWEEN_MS = 200;

let lastFinishedAt = 0;

export async function withTranscriptLimit<T>(fn: () => Promise<T>): Promise<T> {
  return limit(async () => {
    const elapsed = Date.now() - lastFinishedAt;
    if (elapsed < DELAY_BETWEEN_MS) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS - elapsed));
    }
    try {
      return await fn();
    } finally {
      lastFinishedAt = Date.now();
    }
  });
}
