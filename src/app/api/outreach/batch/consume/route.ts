import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  consumeBatch,
  BatchNotFoundError,
} from '@/lib/services/outreach-batch';
import { logger } from '@/lib/logger';

// Public (no session) — called by the .command bash script after it opens
// the Mail.app drafts. Authentication is via the one-time token issued by
// /api/outreach/batch/create (see middleware.ts for the bypass).
const RequestSchema = z.object({
  token: z.string().min(20).max(128),
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
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 });
  }

  try {
    const result = consumeBatch(parsed.data.token);

    // Revalidate so the admin UI reflects the new 'sent' status without a
    // manual refresh. Cheap because /admin/channels is server-rendered.
    revalidatePath('/admin/channels');
    if (result.ok) {
      for (const id of result.channelIds) {
        revalidatePath(`/admin/channels/${id}`);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BatchNotFoundError) {
      return NextResponse.json({ ok: false, error: 'batch_not_found' }, { status: 404 });
    }
    logger.error({ err }, 'outreach batch consume failed');
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
