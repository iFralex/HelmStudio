import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmpDir: string;

vi.mock('../../env', () => ({
  env: {
    get DATA_DIR() {
      return tmpDir;
    },
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

import { dumpRaw, loadRaw, deleteRawForChannel } from '../raw';

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'raw-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('dumpRaw / loadRaw round-trip', () => {
  it('writes and reads back a JSON payload', async () => {
    const payload = { hello: 'world', n: 42 };
    const rel = path.join('raw', 'youtube', 'search', '2024-01-01', 'kw-ts.json');

    const returned = await dumpRaw(rel, payload);
    expect(returned).toBe(rel);

    const loaded = await loadRaw<typeof payload>(rel);
    expect(loaded).toEqual(payload);
  });

  it('creates parent directories automatically', async () => {
    const rel = path.join('raw', 'deeply', 'nested', 'dir', 'file.json');
    await dumpRaw(rel, { ok: true });

    const absPath = path.join(tmpDir, rel);
    const stat = await fs.stat(absPath);
    expect(stat.isFile()).toBe(true);
  });

  it('write is atomic: no .tmp file remains after success', async () => {
    const rel = path.join('raw', 'test', 'atomic.json');
    await dumpRaw(rel, { x: 1 });

    const absPath = path.join(tmpDir, rel);
    await expect(fs.access(`${absPath}.tmp`)).rejects.toThrow();
  });
});

describe('loadRaw', () => {
  it('throws ENOENT when file is missing', async () => {
    await expect(loadRaw('raw/does/not/exist.json')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('deleteRawForChannel', () => {
  it('removes all channel-specific subdirectories', async () => {
    const channelId = 'UCtest123';

    const relPaths = [
      path.join('raw', 'transcripts', channelId, 'v1.json'),
      path.join('raw', 'youtube', 'channels', channelId, 'meta-ts.json'),
      path.join('raw', 'youtube', 'videos', channelId, 'batch-ts.json'),
      path.join('raw', 'llm', 'qualifications', channelId, 'run-1-ts.json'),
      path.join('raw', 'llm', 'video_selections', channelId, 'run-1-ts.json'),
      path.join('raw', 'llm', 'drafts', channelId, 'ts.json'),
    ];

    for (const rel of relPaths) {
      await dumpRaw(rel, { data: rel });
    }

    await deleteRawForChannel(channelId);

    for (const rel of relPaths) {
      const absPath = path.join(tmpDir, rel);
      await expect(fs.access(absPath)).rejects.toThrow();
    }
  });

  it('does not throw when channel directories do not exist', async () => {
    await expect(deleteRawForChannel('UCnonexistent')).resolves.toBeUndefined();
  });

  it('leaves other channel data intact', async () => {
    const keepChannel = 'UCkeep';
    const deleteChannel = 'UCdelete';

    const keepRel = path.join('raw', 'transcripts', keepChannel, 'v1.json');
    const deleteRel = path.join('raw', 'transcripts', deleteChannel, 'v1.json');

    await dumpRaw(keepRel, { keep: true });
    await dumpRaw(deleteRel, { delete: true });

    await deleteRawForChannel(deleteChannel);

    const loaded = await loadRaw(keepRel);
    expect(loaded).toEqual({ keep: true });

    await expect(loadRaw(deleteRel)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
