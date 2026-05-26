/**
 * localStorage-backed outreach queue.
 *
 * The admin adds individual drafts to a per-browser queue; when ready, the
 * queue is materialised into a downloadable .command file. Storage is local
 * (not synced server-side) because the queue is a working buffer the admin
 * can curate freely without polluting the DB.
 *
 * Stored shape is versioned so we can evolve the structure without losing
 * in-flight queues silently — a mismatch resets to empty.
 */

export const QUEUE_STORAGE_KEY = 'helmstudio.outreach.queue.v1';
const SCHEMA_VERSION = 1;

export type OutreachQueueItem = {
  channelId: string;
  channelTitle: string;
  recipientEmail: string;
  subject: string;
  /** Full plain-text email body (greeting + middle + footer). */
  body: string;
  queuedAt: number;
};

type StoredShape = {
  version: number;
  items: OutreachQueueItem[];
};

function isStoredShape(x: unknown): x is StoredShape {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.version === SCHEMA_VERSION && Array.isArray(o.items);
}

export function readQueue(): OutreachQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredShape(parsed)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

export function writeQueue(items: OutreachQueueItem[]): void {
  if (typeof window === 'undefined') return;
  const payload: StoredShape = { version: SCHEMA_VERSION, items };
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(payload));
}

export function addToQueue(item: OutreachQueueItem): OutreachQueueItem[] {
  const items = readQueue();
  const existing = items.findIndex((i) => i.channelId === item.channelId);
  if (existing >= 0) {
    // Re-queueing replaces the snapshot in place (so edits to the draft
    // since the last queue action are picked up).
    items[existing] = item;
  } else {
    items.push(item);
  }
  writeQueue(items);
  return items;
}

export function removeFromQueue(channelId: string): OutreachQueueItem[] {
  const items = readQueue().filter((i) => i.channelId !== channelId);
  writeQueue(items);
  return items;
}

export function clearQueue(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(QUEUE_STORAGE_KEY);
}

export function isInQueue(channelId: string): boolean {
  return readQueue().some((i) => i.channelId === channelId);
}
