const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT']);
const MAX_DELAY_MS = 10_000;

function isRetryable(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;

  // Network-level errors
  if (typeof e['code'] === 'string' && RETRYABLE_CODES.has(e['code'])) return true;

  // HTTP errors from googleapis (GaxiosError shape)
  const status =
    typeof e['status'] === 'number'
      ? e['status']
      : typeof e['response'] === 'object' &&
          e['response'] !== null &&
          typeof (e['response'] as Record<string, unknown>)['status'] === 'number'
        ? ((e['response'] as Record<string, unknown>)['status'] as number)
        : null;

  if (status === null) return false;
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  const { attempts = 4, baseMs = 500 } = options;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt === attempts - 1) throw err;
      const backoff = Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 250, MAX_DELAY_MS);
      await delay(backoff);
    }
  }
  // unreachable: loop always exits by throwing
  throw new Error('withRetry: exhausted attempts');
}
