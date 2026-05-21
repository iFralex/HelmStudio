'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { forceRequalifyChannel } from '@/lib/pipeline/qualification';
import { generateDraftForChannel } from '@/lib/services/outreach';
import { getDb } from '@/lib/db/client';
import { channels, outreachDrafts, pipelineEvents } from '@/lib/db/schema';
import { deleteRawForChannel } from '@/lib/storage/raw';
import { deleteTranscriptsForChannel } from '@/lib/transcripts/store';
import { logger } from '@/lib/logger';

const ChannelIdSchema = z.object({ channelId: z.string().min(1) });

const EmailSchema = z.object({
  channelId: z.string().min(1),
  email: z
    .string()
    .trim()
    .email('Inserisci un indirizzo email valido'),
});

const OutreachStatusSchema = z.object({
  channelId: z.string().min(1),
  status: z.enum(['none', 'email_added', 'drafted', 'sent', 'replied', 'no_reply', 'ignored']),
});

const DraftSubjectSchema = z.object({
  draftId: z.coerce.number().int().positive(),
  subject: z.string(),
});

const DraftBodySchema = z.object({
  draftId: z.coerce.number().int().positive(),
  body: z.string(),
});

function insertMetaEvent(
  db: ReturnType<typeof getDb>,
  channelId: string,
  event: string,
  details?: Record<string, unknown>,
) {
  db.insert(pipelineEvents)
    .values({
      channelId,
      stage: 'meta',
      level: 'info',
      event,
      details: details ?? null,
    })
    .run();
}

export async function requalifyChannel(formData: FormData): Promise<void> {
  const parsed = ChannelIdSchema.safeParse({ channelId: formData.get('channelId') });
  if (!parsed.success) return;

  const { channelId } = parsed.data;
  logger.info({ channelId }, 'requalify channel requested');
  await forceRequalifyChannel(channelId);
  revalidatePath(`/channels/${channelId}`);
}

export async function saveEmailAndDraft(formData: FormData): Promise<void> {
  const parsed = EmailSchema.safeParse({
    channelId: formData.get('channelId'),
    email: formData.get('email'),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi');
  }

  const { channelId, email } = parsed.data;
  const db = getDb();
  logger.info({ channelId, email }, 'saving email and generating draft');

  db.transaction((tx) => {
    tx.update(channels)
      .set({ email, outreachStatus: 'email_added', emailAddedAt: new Date() })
      .where(eq(channels.id, channelId))
      .run();
    tx.insert(pipelineEvents)
      .values({ channelId, stage: 'meta', level: 'info', event: 'email_saved', details: { email } })
      .run();
  });

  try {
    await generateDraftForChannel(channelId, db);
    db.transaction((tx) => {
      tx.update(channels).set({ outreachStatus: 'drafted' }).where(eq(channels.id, channelId)).run();
      tx.insert(pipelineEvents)
        .values({ channelId, stage: 'meta', level: 'info', event: 'draft_generated' })
        .run();
    });
  } catch (err) {
    logger.error({ channelId, err }, 'draft generation failed');
    throw err;
  }

  revalidatePath(`/channels/${channelId}`);
  revalidatePath('/channels');
}

export async function regenerateDraft(formData: FormData): Promise<void> {
  const parsed = ChannelIdSchema.safeParse({ channelId: formData.get('channelId') });
  if (!parsed.success) return;

  const { channelId } = parsed.data;
  const db = getDb();
  logger.info({ channelId }, 'regenerating draft');

  await generateDraftForChannel(channelId, db);
  insertMetaEvent(db, channelId, 'draft_regenerated');

  revalidatePath(`/channels/${channelId}`);
}

export async function updateDraftSubject(formData: FormData): Promise<void> {
  const parsed = DraftSubjectSchema.safeParse({
    draftId: formData.get('draftId'),
    subject: formData.get('subject'),
  });
  if (!parsed.success) return;

  const { draftId, subject } = parsed.data;
  const db = getDb();
  db.update(outreachDrafts).set({ subject }).where(eq(outreachDrafts.id, draftId)).run();

  const draft = db.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).get();
  if (draft) revalidatePath(`/channels/${draft.channelId}`);
}

export async function updateDraftBody(formData: FormData): Promise<void> {
  const parsed = DraftBodySchema.safeParse({
    draftId: formData.get('draftId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return;

  const { draftId, body } = parsed.data;
  const db = getDb();
  db.update(outreachDrafts).set({ body }).where(eq(outreachDrafts.id, draftId)).run();

  const draft = db.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).get();
  if (draft) revalidatePath(`/channels/${draft.channelId}`);
}

export async function markOutreachStatus(formData: FormData): Promise<void> {
  const parsed = OutreachStatusSchema.safeParse({
    channelId: formData.get('channelId'),
    status: formData.get('status'),
  });
  if (!parsed.success) return;

  const { channelId, status } = parsed.data;
  const db = getDb();

  const update: Partial<typeof channels.$inferInsert> = { outreachStatus: status };
  if (status === 'sent') {
    update.outreachSentAt = new Date();
  }

  db.transaction((tx) => {
    tx.update(channels).set(update).where(eq(channels.id, channelId)).run();
    tx.insert(pipelineEvents)
      .values({
        channelId,
        stage: 'meta',
        level: 'info',
        event: 'outreach_status_changed',
        details: { status },
      })
      .run();
  });

  logger.info({ channelId, status }, 'outreach status updated');
  revalidatePath(`/channels/${channelId}`);
  revalidatePath('/channels');
}

export async function updateOutreachNotes(formData: FormData): Promise<void> {
  const parsed = ChannelIdSchema.merge(z.object({ notes: z.string() })).safeParse({
    channelId: formData.get('channelId'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return;

  const { channelId, notes } = parsed.data;
  const db = getDb();
  db.update(channels).set({ outreachNotes: notes }).where(eq(channels.id, channelId)).run();
  revalidatePath(`/channels/${channelId}`);
}

export async function deleteChannel(formData: FormData): Promise<void> {
  const parsed = ChannelIdSchema.safeParse({ channelId: formData.get('channelId') });
  if (!parsed.success) return;

  const { channelId } = parsed.data;
  const db = getDb();
  logger.info({ channelId }, 'deleting channel');

  // Delete raw files before the DB row is gone (foreign key sets channelId to null on delete)
  await Promise.all([
    deleteTranscriptsForChannel(channelId, db),
    deleteRawForChannel(channelId),
  ]);

  db.transaction((tx) => {
    tx.insert(pipelineEvents)
      .values({ channelId, stage: 'meta', level: 'info', event: 'channel_deleted' })
      .run();
    tx.delete(channels).where(eq(channels.id, channelId)).run();
  });

  logger.info({ channelId }, 'channel deleted');
  revalidatePath('/channels');
  revalidatePath('/');
  redirect('/channels');
}
