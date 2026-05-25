'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@/lib/ui/copy';

export function RunPoller() {
  const router = useRouter();

  useEffect(() => {
    const intervalId = setInterval(() => {
      router.refresh();
    }, 5_000);
    return () => clearInterval(intervalId);
  }, [router]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      <span>{copy.runs.autoRefresh}</span>
    </div>
  );
}
