import { describe, it, expect, vi } from 'vitest';

vi.mock('../../env', () => ({
  env: {
    DATA_DIR: '/test/data',
    DATABASE_PATH: '/test/data/pipeline.db',
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

import { dataDir, paths, tsForFilename, slugify, absolutePath } from '../paths';

describe('dataDir', () => {
  it('returns DATA_DIR from env', () => {
    expect(dataDir()).toBe('/test/data');
  });
});

describe('paths', () => {
  it('db path matches DATABASE_PATH', () => {
    expect(paths.db()).toBe('/test/data/pipeline.db');
  });

  it('logsDir is under DATA_DIR', () => {
    expect(paths.logsDir()).toBe('/test/data/logs');
  });

  it('rawYoutubeSearch returns relative path', () => {
    const p = paths.rawYoutubeSearch('2024-01-01', 'my-keyword', '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/youtube/search/2024-01-01/my-keyword-2024-01-01T00-00-00.000Z.json');
    expect(p).not.toMatch(/^[/\\]/);
  });

  it('rawYoutubeChannelMeta returns relative path with channelId', () => {
    const p = paths.rawYoutubeChannelMeta('UCabc123', '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/youtube/channels/UCabc123/meta-2024-01-01T00-00-00.000Z.json');
    expect(p).not.toMatch(/^[/\\]/);
  });

  it('rawYoutubeChannelUploads returns relative path', () => {
    const p = paths.rawYoutubeChannelUploads('UCabc123', '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/youtube/channels/UCabc123/uploads-2024-01-01T00-00-00.000Z.json');
  });

  it('rawYoutubeVideosBatch returns relative path', () => {
    const p = paths.rawYoutubeVideosBatch('UCabc123', '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/youtube/videos/UCabc123/batch-2024-01-01T00-00-00.000Z.json');
  });

  it('rawTranscript returns relative path', () => {
    const p = paths.rawTranscript('UCabc123', 'vid001');
    expect(p).toBe('raw/transcripts/UCabc123/vid001.json');
  });

  it('rawLlmVideoSelection returns relative path', () => {
    const p = paths.rawLlmVideoSelection('UCabc123', 42, '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/llm/video_selections/UCabc123/run-42-2024-01-01T00-00-00.000Z.json');
  });

  it('rawLlmQualification returns relative path', () => {
    const p = paths.rawLlmQualification('UCabc123', 7, '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/llm/qualifications/UCabc123/run-7-2024-01-01T00-00-00.000Z.json');
  });

  it('rawLlmDraft returns relative path', () => {
    const p = paths.rawLlmDraft('UCabc123', '2024-01-01T00-00-00.000Z');
    expect(p).toBe('raw/llm/drafts/UCabc123/2024-01-01T00-00-00.000Z.json');
  });
});

describe('tsForFilename', () => {
  it('replaces colons with dashes for filesystem safety', () => {
    const d = new Date('2024-03-15T12:34:56.789Z');
    expect(tsForFilename(d)).toBe('2024-03-15T12-34-56.789Z');
  });

  it('uses current date when no argument given', () => {
    const before = Date.now();
    const result = tsForFilename();
    const after = Date.now();
    expect(result).not.toContain(':');
    // should be a valid ISO string after restoring colons
    const restored = result.replace(/-(\d{2})-(\d{2})\./,  ':$1:$2.');
    const parsed = Date.parse(restored);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanum with dashes', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('collapses multiple special chars to a single dash', () => {
    expect(slugify('foo  --  bar')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('truncates at 50 chars', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long)).toHaveLength(50);
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('does not produce a trailing dash when truncation cuts into a separator', () => {
    // 49 alphanum chars + special chars that become a dash → slice at 50 would leave trailing dash
    const result = slugify('a'.repeat(49) + '!!!rest');
    expect(result).not.toMatch(/-$/);
  });
});

describe('paths channelId validation', () => {
  it('throws for channelId with path traversal characters', () => {
    expect(() => paths.rawYoutubeChannelMeta('../etc', 'ts')).toThrow('Invalid channelId');
    expect(() => paths.rawYoutubeChannelUploads('../etc', 'ts')).toThrow('Invalid channelId');
    expect(() => paths.rawYoutubeVideosBatch('../etc', 'ts')).toThrow('Invalid channelId');
    expect(() => paths.rawTranscript('../etc', 'vid')).toThrow('Invalid channelId');
    expect(() => paths.rawLlmVideoSelection('../etc', 1, 'ts')).toThrow('Invalid channelId');
    expect(() => paths.rawLlmQualification('../etc', 1, 'ts')).toThrow('Invalid channelId');
    expect(() => paths.rawLlmDraft('../etc', 'ts')).toThrow('Invalid channelId');
  });

  it('throws for channelId with spaces or special chars', () => {
    expect(() => paths.rawTranscript('bad id!', 'vid')).toThrow('Invalid channelId');
  });

  it('accepts valid channelId with alphanumeric, dash, underscore', () => {
    expect(() => paths.rawTranscript('UC-abc_123', 'vid')).not.toThrow();
  });
});

describe('absolutePath', () => {
  it('prepends DATA_DIR to a relative path', () => {
    expect(absolutePath('raw/youtube/search/2024/foo.json')).toBe(
      '/test/data/raw/youtube/search/2024/foo.json',
    );
  });

  it('throws when path traversal escapes DATA_DIR', () => {
    expect(() => absolutePath('../etc/passwd')).toThrow('Path escapes DATA_DIR');
  });

  it('throws for absolute path outside DATA_DIR', () => {
    expect(() => absolutePath('/etc/passwd')).toThrow('Path escapes DATA_DIR');
  });
});
