import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIsRunActive, mockSpawn } = vi.hoisted(() => ({
  mockIsRunActive: vi.fn(),
  mockSpawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

vi.mock('@/lib/pipeline/lifecycle', () => ({
  isRunActive: mockIsRunActive,
}));

vi.mock('node:child_process', () => {
  return {
    spawn: mockSpawn,
    default: { spawn: mockSpawn },
  };
});

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATA_DIR: '/tmp/api-run-test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
  },
}));

import { POST } from '../run/route';

describe('POST /api/pipeline/run', () => {
  beforeEach(() => {
    mockIsRunActive.mockClear();
    mockSpawn.mockClear();
    mockSpawn.mockReturnValue({ unref: vi.fn() });
  });

  it('returns 409 when a run is already active', async () => {
    mockIsRunActive.mockResolvedValue({ active: true, runId: 42 });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('run_already_active');
    expect(body.runId).toBe(42);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('returns 202 when no run is active', async () => {
    mockIsRunActive.mockResolvedValue({ active: false });

    const fakeChild = { unref: vi.fn() };
    mockSpawn.mockReturnValueOnce(fakeChild);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(fakeChild.unref).toHaveBeenCalledOnce();

    const spawnArgs = mockSpawn.mock.calls[0]!;
    expect(spawnArgs[0]).toBe(process.execPath);
    expect(spawnArgs[1]).toEqual(['--import', 'tsx', 'src/worker/run.ts', '--manual']);
    // In non-production envs, stdio inherits stdout/stderr for debugging
    const expectedStdio = process.env.NODE_ENV === 'production' ? 'ignore' : ['ignore', 'inherit', 'inherit'];
    expect(spawnArgs[2]).toMatchObject({ detached: true, stdio: expectedStdio });
  });
});
