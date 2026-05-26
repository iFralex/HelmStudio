'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  QUEUE_STORAGE_KEY,
  readQueue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  type OutreachQueueItem,
} from './queue-storage';

/**
 * React hook over the localStorage outreach queue.
 *
 * Subscribes to the `storage` event so changes made in other tabs (or by
 * other components on the same page that bypassed the hook) propagate
 * automatically. Also re-reads on `visibilitychange` so returning to the
 * tab from another window picks up the latest state.
 *
 * The initial state is empty for hydration safety; the real value loads in
 * a useEffect after mount.
 */
export function useOutreachQueue() {
  const [items, setItems] = useState<OutreachQueueItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readQueue());
    setHydrated(true);

    const refresh = () => setItems(readQueue());

    const onStorage = (e: StorageEvent) => {
      if (e.key === QUEUE_STORAGE_KEY || e.key === null) refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const add = useCallback((item: OutreachQueueItem) => {
    setItems(addToQueue(item));
  }, []);

  const remove = useCallback((channelId: string) => {
    setItems(removeFromQueue(channelId));
  }, []);

  const clear = useCallback(() => {
    clearQueue();
    setItems([]);
  }, []);

  return { items, hydrated, add, remove, clear };
}
