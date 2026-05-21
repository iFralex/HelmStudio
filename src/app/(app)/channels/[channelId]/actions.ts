'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { forceRequalifyChannel } from '@/lib/pipeline/qualification';
import { generateDraftForChannel } from '@/lib/services/outreach';
import { getDb } from '@/lib/db/client';
import { channels, outreachDrafts } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import type { Channel } from '@/lib/db/queries';

export async function requalifyChannel(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  if (!channelId) return;
  logger.info({ channelId }, 'requalify channel requested');
  await forceRequalifyChannel(channelId);
  revalidatePath(`/channels/${channelId}`);
}

export async function saveEmailAndDraft(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  const email = ((formData.get('email') as string) ?? '').trim();
  if (!channelId || !email) return;

  const db = getDb();
  logger.info({ channelId, email }, 'saving email and generating draft');

  db.update(channels)
    .set({ email, outreachStatus: 'email_added', emailAddedAt: new Date() })
    .where(eq(channels.id, channelId))
    .run();

  try {
    await generateDraftForChannel(channelId, db);
    db.update(channels)
      .set({ outreachStatus: 'drafted' })
      .where(eq(channels.id, channelId))
      .run();
  } catch (err) {
    logger.error({ channelId, err }, 'draft generation failed');
    throw err;
  }

  revalidatePath(`/channels/${channelId}`);
  revalidatePath('/channels');
}

export async function regenerateDraft(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  if (!channelId) return;

  logger.info({ channelId }, 'regenerating draft');
  await generateDraftForChannel(channelId);
  revalidatePath(`/channels/${channelId}`);
}

export async function updateDraftSubject(formData: FormData): Promise<void> {
  const draftId = Number(formData.get('draftId'));
  const subject = formData.get('subject') as string;
  if (!draftId || subject === null) return;

  const db = getDb();
  db.update(outreachDrafts).set({ subject }).where(eq(outreachDrafts.id, draftId)).run();

  const draft = db.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).get();
  if (draft) revalidatePath(`/channels/${draft.channelId}`);
}

export async function updateDraftBody(formData: FormData): Promise<void> {
  const draftId = Number(formData.get('draftId'));
  const body = formData.get('body') as string;
  if (!draftId || body === null) return;

  const db = getDb();
  db.update(outreachDrafts).set({ body }).where(eq(outreachDrafts.id, draftId)).run();

  const draft = db.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).get();
  if (draft) revalidatePath(`/channels/${draft.channelId}`);
}

export async function markOutreachStatus(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  const status = formData.get('status') as Channel['outreachStatus'];
  if (!channelId || !status) return;

  const db = getDb();
  const update: Partial<typeof channels.$inferInsert> = { outreachStatus: status };
  if (status === 'sent') {
    update.outreachSentAt = new Date();
  }

  db.update(channels).set(update).where(eq(channels.id, channelId)).run();
  logger.info({ channelId, status }, 'outreach status updated');

  revalidatePath(`/channels/${channelId}`);
  revalidatePath('/channels');
}

export async function updateOutreachNotes(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  const notes = (formData.get('notes') as string) ?? '';
  if (!channelId) return;

  const db = getDb();
  db.update(channels).set({ outreachNotes: notes }).where(eq(channels.id, channelId)).run();
  revalidatePath(`/channels/${channelId}`);
}
