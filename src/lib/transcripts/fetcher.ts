import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';

export type TranscriptSegment = {
  text: string;
  start: number; // seconds
  duration: number; // seconds
};

export type TranscriptFetchResult =
  | {
      ok: true;
      videoId: string;
      language: string; // resolved code, e.g. 'it', 'en', 'it-IT'
      segments: TranscriptSegment[];
      text: string; // segments joined with spaces
      characterCount: number;
    }
  | {
      ok: false;
      videoId: string;
      reason:
        | 'no_captions'
        | 'unavailable'
        | 'forbidden'
        | 'rate_limited'
        | 'parse_error'
        | 'unknown';
      message: string;
    };

type RawSegment = { text: string; duration: number; offset: number; lang?: string };

// The youtube-transcript library returns ms in srv3 format and seconds in classic
// format. Heuristic: if the first segment's duration > 10, assume milliseconds.
function normalizeSegments(rawSegments: RawSegment[]): TranscriptSegment[] {
  const first = rawSegments[0];
  const inMs = first != null && first.duration > 10;
  const divisor = inMs ? 1000 : 1;
  return rawSegments.map((seg) => ({
    text: seg.text,
    start: seg.offset / divisor,
    duration: seg.duration / divisor,
  }));
}

function classifyError(err: unknown): Exclude<TranscriptFetchResult, { ok: true }>['reason'] {
  if (err instanceof YoutubeTranscriptTooManyRequestError) return 'rate_limited';
  if (err instanceof YoutubeTranscriptVideoUnavailableError) return 'unavailable';
  if (err instanceof YoutubeTranscriptDisabledError) return 'no_captions';
  if (err instanceof YoutubeTranscriptNotAvailableError) return 'no_captions';
  return 'unknown';
}

export async function fetchTranscript(
  videoId: string,
  opts?: { preferredLanguages?: string[] },
): Promise<TranscriptFetchResult> {
  const preferredLanguages = opts?.preferredLanguages ?? ['it', 'en'];

  for (const lang of preferredLanguages) {
    try {
      const rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const segments = normalizeSegments(rawSegments);
      const text = segments.map((s) => s.text).join(' ');
      return {
        ok: true,
        videoId,
        language: rawSegments[0]?.lang ?? lang ?? 'unknown',
        segments,
        text,
        characterCount: text.length,
      };
    } catch (err) {
      if (err instanceof YoutubeTranscriptNotAvailableLanguageError) {
        // Language not available — try next preferred language
        continue;
      }
      // All other errors are terminal (rate limit, unavailable, disabled, etc.)
      const reason = classifyError(err);
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, videoId, reason, message };
    }
  }

  // All preferred languages failed with language-not-available; try any language
  try {
    const rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    const segments = normalizeSegments(rawSegments);
    const text = segments.map((s) => s.text).join(' ');
    return {
      ok: true,
      videoId,
      language: rawSegments[0]?.lang ?? 'unknown',
      segments,
      text,
      characterCount: text.length,
    };
  } catch (err) {
    const reason = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, videoId, reason, message };
  }
}
