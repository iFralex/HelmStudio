'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function DashboardPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
