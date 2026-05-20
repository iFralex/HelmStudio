import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../limiter', () => ({
  withTranscriptLimit: (fn: () => Promise<unknown>) => fn(),
}));

const { mockYtFetch } = vi.hoisted(() => ({
  mockYtFetch: vi.fn(),
}));

vi.mock('youtube-transcript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('youtube-transcript')>();
  return {
    ...actual,
    YoutubeTranscript: {
      fetchTranscript: mockYtFetch,
    },
  };
});

import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { fetchTranscript } from '../fetcher';

// duration > 10 triggers ms-to-seconds normalization (÷1000)
const SEGMENTS_IT = [
  { text: 'Ciao', offset: 0, duration: 2000, lang: 'it' },
  { text: 'mondo', offset: 2000, duration: 1500, lang: 'it' },
];
const SEGMENTS_EN = [{ text: 'Hello', offset: 0, duration: 2000, lang: 'en' }];

describe('fetchTranscript', () => {
  beforeEach(() => {
    mockYtFetch.mockReset();
  });

  it('returns ok result when first preferred language succeeds', async () => {
    mockYtFetch.mockResolvedValueOnce(SEGMENTS_IT);

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.videoId).toBe('abc123');
    expect(result.language).toBe('it');
    expect(result.text).toBe('Ciao mondo');
    expect(result.characterCount).toBe(10);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.start).toBeCloseTo(0);
    expect(result.segments[0]!.duration).toBeCloseTo(2);
    expect(mockYtFetch).toHaveBeenCalledOnce();
    expect(mockYtFetch).toHaveBeenCalledWith('abc123', { lang: 'it' });
  });

  it("falls back from 'it' to 'en' and succeeds", async () => {
    mockYtFetch
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('it', ['en'], 'abc123'),
      )
      .mockResolvedValueOnce(SEGMENTS_EN);

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe('en');
    expect(mockYtFetch).toHaveBeenCalledTimes(2);
    expect(mockYtFetch).toHaveBeenNthCalledWith(1, 'abc123', { lang: 'it' });
    expect(mockYtFetch).toHaveBeenNthCalledWith(2, 'abc123', { lang: 'en' });
  });

  it('falls back to any language when all preferred are unavailable and succeeds', async () => {
    mockYtFetch
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('it', [], 'abc123'),
      )
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('en', [], 'abc123'),
      )
      .mockResolvedValueOnce([{ text: 'Hola', offset: 0, duration: 2000, lang: 'es' }]);

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe('es');
    expect(mockYtFetch).toHaveBeenCalledTimes(3);
    expect(mockYtFetch).toHaveBeenNthCalledWith(3, 'abc123');
  });

  it('returns no_captions when all attempts fail with no-captions errors', async () => {
    mockYtFetch
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('it', [], 'abc123'),
      )
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('en', [], 'abc123'),
      )
      .mockRejectedValueOnce(new YoutubeTranscriptDisabledError('abc123'));

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_captions');
    expect(mockYtFetch).toHaveBeenCalledTimes(3);
    expect(mockYtFetch).toHaveBeenNthCalledWith(3, 'abc123');
  });

  it('returns no_captions immediately for YoutubeTranscriptNotAvailableError', async () => {
    mockYtFetch.mockRejectedValueOnce(new YoutubeTranscriptNotAvailableError('abc123'));

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_captions');
    expect(mockYtFetch).toHaveBeenCalledOnce();
  });

  it('classifies rate_limited for TooManyRequestError', async () => {
    mockYtFetch.mockRejectedValueOnce(new YoutubeTranscriptTooManyRequestError());

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('rate_limited');
    expect(result.videoId).toBe('abc123');
  });

  it('classifies unavailable for VideoUnavailableError', async () => {
    mockYtFetch.mockRejectedValueOnce(new YoutubeTranscriptVideoUnavailableError('abc123'));

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
  });

  it('classifies unknown for unrecognized errors', async () => {
    mockYtFetch.mockRejectedValueOnce(new Error('unexpected network issue'));

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown');
    expect(result.message).toBe('unexpected network issue');
  });

  it('uses custom preferred languages when provided, trying each in order', async () => {
    mockYtFetch
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('it', [], 'abc123'),
      )
      .mockResolvedValueOnce([{ text: 'Bonjour', offset: 0, duration: 2000, lang: 'fr' }]);

    const result = await fetchTranscript('abc123', { preferredLanguages: ['it', 'fr'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.language).toBe('fr');
    expect(mockYtFetch).toHaveBeenCalledTimes(2);
    expect(mockYtFetch).toHaveBeenNthCalledWith(1, 'abc123', { lang: 'it' });
    expect(mockYtFetch).toHaveBeenNthCalledWith(2, 'abc123', { lang: 'fr' });
  });

  it('normalizes classic seconds-format segments (duration < 1000) without dividing', async () => {
    mockYtFetch.mockResolvedValueOnce([
      { text: 'Ciao', offset: 0, duration: 3.5, lang: 'it' },
      { text: 'mondo', offset: 3.5, duration: 2.0, lang: 'it' },
    ]);

    const result = await fetchTranscript('abc123', { preferredLanguages: ['it'] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.segments[0]!.start).toBeCloseTo(0);
    expect(result.segments[0]!.duration).toBeCloseTo(3.5);
    expect(result.segments[1]!.start).toBeCloseTo(3.5);
    expect(result.segments[1]!.duration).toBeCloseTo(2.0);
  });

  it('returns no_captions when fallback any-language call throws NotAvailableLanguageError', async () => {
    mockYtFetch
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('it', [], 'abc123'),
      )
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('en', [], 'abc123'),
      )
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError('', [], 'abc123'),
      );

    const result = await fetchTranscript('abc123');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_captions');
    expect(mockYtFetch).toHaveBeenCalledTimes(3);
  });
});
