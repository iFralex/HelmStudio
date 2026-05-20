import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./env', () => ({
  env: {
    DATA_DIR: '/test/data',
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports a logger instance', async () => {
    const { logger } = await import('./logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('childLogger returns a child logger with bindings', async () => {
    const { logger, childLogger } = await import('./logger');
    const child = childLogger({ requestId: 'abc123' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(child).not.toBe(logger);
  });

  it('does not throw when logging a message', async () => {
    const { logger } = await import('./logger');
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.warn({ key: 'val' }, 'warning')).not.toThrow();
    expect(() => logger.error(new Error('boom'), 'error event')).not.toThrow();
  });
});
