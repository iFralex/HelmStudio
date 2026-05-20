import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeHttpError(status: number): Error {
  const e = new Error(`HTTP ${status}`);
  (e as unknown as Record<string, unknown>)['status'] = status;
  return e;
}

function makeNetworkError(code: string): Error {
  const e = new Error(code);
  (e as unknown as Record<string, unknown>)['code'] = code;
  return e;
}

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const p = withRetry(fn);
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeHttpError(429))
      .mockRejectedValueOnce(makeHttpError(429))
      .mockResolvedValue('done');

    const p = withRetry(fn, { attempts: 4, baseMs: 10 });
    await vi.runAllTimersAsync();
    expect(await p).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on HTTP 500', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeHttpError(500)).mockResolvedValue('ok');
    const p = withRetry(fn, { attempts: 4, baseMs: 10 });
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ECONNRESET', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeNetworkError('ECONNRESET')).mockResolvedValue('ok');
    const p = withRetry(fn, { attempts: 4, baseMs: 10 });
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on ETIMEDOUT', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeNetworkError('ETIMEDOUT')).mockResolvedValue('ok');
    const p = withRetry(fn, { attempts: 4, baseMs: 10 });
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on HTTP 400', async () => {
    const fn = vi.fn().mockRejectedValue(makeHttpError(400));
    await expect(withRetry(fn, { attempts: 4, baseMs: 10 })).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on HTTP 401', async () => {
    const fn = vi.fn().mockRejectedValue(makeHttpError(401));
    await expect(withRetry(fn, { attempts: 4, baseMs: 10 })).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on HTTP 403', async () => {
    const fn = vi.fn().mockRejectedValue(makeHttpError(403));
    await expect(withRetry(fn, { attempts: 4, baseMs: 10 })).rejects.toMatchObject({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on HTTP 404', async () => {
    const fn = vi.fn().mockRejectedValue(makeHttpError(404));
    await expect(withRetry(fn, { attempts: 4, baseMs: 10 })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts all attempts and throws last error', async () => {
    const err = makeHttpError(503);
    const fn = vi.fn().mockRejectedValue(err);
    const p = withRetry(fn, { attempts: 3, baseMs: 10 });
    const assertion = expect(p).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('also detects retryable status via response.status shape', async () => {
    const err = new Error('gaxios');
    (err as unknown as Record<string, unknown>)['response'] = { status: 503 };
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');
    const p = withRetry(fn, { attempts: 4, baseMs: 10 });
    await vi.runAllTimersAsync();
    expect(await p).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
