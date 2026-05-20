import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetOrFetch } = vi.hoisted(() => ({
  mockGetOrFetch: vi.fn(),
}));

vi.mock('../store', () => ({
  getOrFetchTranscript: mockGetOrFetch,
}));

import { getOrFetchManyTranscripts } from '../batch';

describe('getOrFetchManyTranscripts', () => {
  beforeEach(() => {
    mockGetOrFetch.mockReset();
  });

  it('returns results for all videoIds preserving order', async () => {
    mockGetOrFetch
      .mockResolvedValueOnce({ ok: true, videoId: 'vid1', language: 'it', segments: [], text: '', characterCount: 0 })
      .mockResolvedValueOnce({ ok: false, videoId: 'vid2', reason: 'no_captions', message: 'disabled' });

    const results = await getOrFetchManyTranscripts({
      channelId: 'chan1',
      videoIds: ['vid1', 'vid2'],
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok).toBe(false);
  });

  it('never throws — converts store exceptions to ok:false results', async () => {
    mockGetOrFetch.mockRejectedValueOnce(new Error('db failure'));

    const results = await getOrFetchManyTranscripts({
      channelId: 'chan1',
      videoIds: ['vid1'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.ok).toBe(false);
    if (!results[0]!.ok) {
      expect(results[0]!.reason).toBe('unknown');
      expect(results[0]!.message).toBe('db failure');
    }
  });

  it('passes preferredLanguages through when provided', async () => {
    mockGetOrFetch.mockResolvedValueOnce({ ok: true, videoId: 'vid1', language: 'fr', segments: [], text: '', characterCount: 0 });

    await getOrFetchManyTranscripts({
      channelId: 'chan1',
      videoIds: ['vid1'],
      preferredLanguages: ['fr', 'de'],
    });

    expect(mockGetOrFetch).toHaveBeenCalledWith({
      videoId: 'vid1',
      channelId: 'chan1',
      preferredLanguages: ['fr', 'de'],
    });
  });

  it('passes undefined preferredLanguages when not provided', async () => {
    mockGetOrFetch.mockResolvedValueOnce({ ok: true, videoId: 'vid1', language: 'it', segments: [], text: '', characterCount: 0 });

    await getOrFetchManyTranscripts({
      channelId: 'chan1',
      videoIds: ['vid1'],
    });

    expect(mockGetOrFetch).toHaveBeenCalledWith({
      videoId: 'vid1',
      channelId: 'chan1',
      preferredLanguages: undefined,
    });
  });

  it('returns empty array for empty videoIds', async () => {
    const results = await getOrFetchManyTranscripts({
      channelId: 'chan1',
      videoIds: [],
    });

    expect(results).toHaveLength(0);
    expect(mockGetOrFetch).not.toHaveBeenCalled();
  });
});
