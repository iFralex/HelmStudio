import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { channels, outreachBatches, pipelineEvents } from '@/lib/db/schema';
import { logger } from '@/lib/logger';

type Db = ReturnType<typeof getDb>;

/**
 * Manages outreach batches — the unit of work created when the admin
 * downloads a .command file containing N pre-composed Mail.app drafts.
 *
 * Lifecycle:
 *  1. `createBatch(channelIds)` is called when the admin clicks "Download
 *     .command". A row is inserted with a fresh random token and the list of
 *     channel IDs being sent.
 *  2. The token is embedded in the generated bash script.
 *  3. After AppleScript finishes opening drafts in Mail.app, the script
 *     curls back to `/api/outreach/batch/consume` with the token.
 *  4. `consumeBatch(token)` marks every channel in the batch as
 *     `outreachStatus='sent'`, sets `outreachSentAt`, logs one
 *     `outreach_status_changed` event per channel, and stamps `consumedAt`
 *     on the batch row.
 *
 * Idempotency: re-consuming a token returns `{ ok: false, reason: 'already_consumed' }`
 * — the .command script may double-fire if the user opens the file twice.
 */

export class BatchNotFoundError extends Error {
  constructor() {
    super('batch_not_found');
    this.name = 'BatchNotFoundError';
  }
}

export type ConsumeResult =
  | { ok: true; channelIds: string[] }
  | { ok: false; reason: 'already_consumed'; consumedAt: Date };

function newToken(): string {
  // 24 bytes → 32-char base64url. Enough entropy that brute-forcing the
  // consume endpoint is infeasible even with a known channel list.
  return randomBytes(24).toString('base64url');
}

export function createBatch(
  channelIds: string[],
  db: Db = getDb(),
): { id: number; token: string } {
  if (channelIds.length === 0) {
    throw new Error('createBatch: channelIds must be non-empty');
  }
  const token = newToken();
  const row = db
    .insert(outreachBatches)
    .values({ token, channelIds })
    .returning({ id: outreachBatches.id })
    .get()!;
  logger.info({ batchId: row.id, count: channelIds.length }, 'outreach batch created');
  return { id: row.id, token };
}

export function consumeBatch(token: string, db: Db = getDb()): ConsumeResult {
  return db.transaction((tx) => {
    const batch = tx
      .select()
      .from(outreachBatches)
      .where(eq(outreachBatches.token, token))
      .get();

    if (!batch) {
      throw new BatchNotFoundError();
    }

    if (batch.consumedAt) {
      logger.info(
        { batchId: batch.id, consumedAt: batch.consumedAt },
        'outreach batch already consumed — no-op',
      );
      return { ok: false, reason: 'already_consumed', consumedAt: batch.consumedAt };
    }

    const now = new Date();
    const ids = batch.channelIds;

    if (ids.length === 0) {
      // Shouldn't happen — createBatch enforces non-empty — but guard anyway.
      tx.update(outreachBatches)
        .set({ consumedAt: now })
        .where(eq(outreachBatches.id, batch.id))
        .run();
      return { ok: true, channelIds: [] };
    }

    tx.update(channels)
      .set({ outreachStatus: 'sent', outreachSentAt: now })
      .where(inArray(channels.id, ids))
      .run();

    for (const channelId of ids) {
      tx.insert(pipelineEvents)
        .values({
          channelId,
          stage: 'meta',
          level: 'info',
          event: 'outreach_status_changed',
          details: { status: 'sent', source: 'batch', batchId: batch.id },
        })
        .run();
    }

    tx.update(outreachBatches)
      .set({ consumedAt: now })
      .where(eq(outreachBatches.id, batch.id))
      .run();

    logger.info(
      { batchId: batch.id, count: ids.length },
      'outreach batch consumed — channels marked as sent',
    );
    return { ok: true, channelIds: ids };
  });
}
