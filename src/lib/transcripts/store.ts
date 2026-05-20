import { eq, desc } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { transcripts } from '../db/schema';
import { getDb } from '../db/client';
import { dumpRaw, loadRaw } from '../storage/raw';
import { paths, absolutePath } from '../storage/paths';
import { logger } from '../logger';
import { fetchTranscript } from './fetcher';
import type { TranscriptFetchResult, TranscriptSegment } from './fetcher';

type Db = ReturnType<typeof getDb>;

const VALID_REASONS = ['no_captions', 'unavailable', 'rate_limited', 'unknown'] as const;
type FailureReason = (typeof VALID_REASONS)[number];

function parseStoredFailure(fetchError: string): { reason: FailureReason; message: string } {
  const idx = fetchError.indexOf(': ');
  const storedReason = idx >= 0 ? fetchError.slice(0, idx) : fetchError;
  const message = idx >= 0 ? fetchError.slice(idx + 2) : '';
  const reason = (VALID_REASONS as readonly string[]).includes(storedReason)
    ? (storedReason as FailureReason)
    : 'unknown';
  return { reason, message };
}

type RawEnvelope = {
  params: { videoId: string; channelId: string };
  language: string;
  segments: TranscriptSegment[];
  fetchedAt: string;
};

export async function getOrFetchTranscript(
  args: { videoId: string; channelId: string; preferredLanguages?: string[] },
  db: Db = getDb(),
): Promise<TranscriptFetchResult> {
  const { videoId, channelId } = args;

  const existing = db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, videoId))
    .orderBy(desc(transcripts.fetchedAt))
    .limit(1)
    .get();

  if (existing) {
    if (existing.fetchSucceeded) {
      let text = existing.text;
      let segments = existing.segments as TranscriptSegment[] | null;

      if (text == null && existing.rawPath) {
        try {
          const envelope = await loadRaw<RawEnvelope>(existing.rawPath);
          segments = envelope.segments;
          text = segments.map((s) => s.text).join(' ');
        } catch {
          // raw file missing — return what we have from DB
        }
      }

      return {
        ok: true,
        videoId,
        language: existing.language ?? 'unknown',
        segments: segments ?? [],
        text: text ?? '',
        characterCount: existing.characterCount ?? (text?.length ?? 0),
      };
    }

    // Failed row — short-circuit if still within 24h
    const ageMs = Date.now() - existing.fetchedAt.getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const { reason, message } = parseStoredFailure(existing.fetchError ?? 'unknown: ');
      return { ok: false, videoId, reason, message };
    }
  }

  const result = await fetchTranscript(videoId, { preferredLanguages: args.preferredLanguages });
  const now = new Date();

  try {
    if (result.ok) {
      const envelope: RawEnvelope = {
        params: { videoId, channelId },
        language: result.language,
        segments: result.segments,
        fetchedAt: now.toISOString(),
      };
      const rawPath = await dumpRaw(paths.rawTranscript(channelId, videoId), envelope);

      const row = {
        videoId,
        channelId,
        language: result.language,
        source: 'youtube_transcript' as const,
        text: result.text,
        segments: result.segments,
        characterCount: result.characterCount,
        fetchSucceeded: true,
        fetchError: null,
        rawPath,
        fetchedAt: now,
      };

      if (existing) {
        db.update(transcripts).set(row).where(eq(transcripts.id, existing.id)).run();
      } else {
        db.insert(transcripts).values(row).onConflictDoUpdate({ target: transcripts.videoId, set: row }).run();
      }
    } else {
      const fetchError = `${result.reason}: ${result.message}`;

      const row = {
        videoId,
        channelId,
        source: 'youtube_transcript' as const,
        fetchSucceeded: false,
        fetchError,
        fetchedAt: now,
      };

      if (existing) {
        db.update(transcripts).set(row).where(eq(transcripts.id, existing.id)).run();
      } else {
        db.insert(transcripts).values(row).onConflictDoUpdate({ target: transcripts.videoId, set: row }).run();
      }
    }
  } catch (err) {
    logger.warn({ err, videoId }, 'transcript persistence failed');
  }

  return result;
}

export async function deleteTranscriptsForChannel(
  channelId: string,
  db: Db = getDb(),
): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(channelId)) {
    throw new Error(`Invalid channelId: ${channelId}`);
  }

  db.delete(transcripts).where(eq(transcripts.channelId, channelId)).run();

  const rel = path.join('raw', 'transcripts', channelId);
  await fs.rm(absolutePath(rel), { recursive: true, force: true });
}
