import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createBatch } from '@/lib/services/outreach-batch';
import { logger } from '@/lib/logger';

// Admin-only (session-protected by src/middleware.ts). Accepts the list of
// channel IDs the admin queued in localStorage; returns the token to embed
// in the generated .command file.
const RequestSchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { id, token } = createBatch(parsed.data.channelIds);
    return NextResponse.json({ ok: true, batchId: id, token });
  } catch (err) {
    logger.error({ err }, 'outreach batch create failed');
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
