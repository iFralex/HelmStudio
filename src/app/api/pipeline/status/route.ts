import { NextResponse } from 'next/server';
import { isRunActive } from '@/lib/pipeline/lifecycle';
import { getLatestRun, countChannelsByStatus } from '@/lib/db/queries';
import { quotaSummary } from '@/lib/youtube/dashboard';

export async function GET() {
  try {
    const [active, latestRun, quota, queues] = await Promise.all([
      isRunActive(),
      getLatestRun(),
      quotaSummary(),
      countChannelsByStatus(),
    ]);

    return NextResponse.json({ active, latestRun, quota, queues });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
