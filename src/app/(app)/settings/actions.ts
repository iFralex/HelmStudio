'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createKeyword,
  updateKeyword,
  deleteKeyword,
  KeywordAlreadyExists,
} from '@/lib/db/queries';
import { updateFilters, updatePipelineConfig } from '@/lib/services/settings';

type ActionResult = { ok: true } | { ok: false; error: string };

const FiltersSchema = z
  .object({
    minSubscribers: z.coerce.number().int().min(0),
    maxSubscribers: z.coerce.number().int().min(0),
    country: z
      .string()
      .max(2)
      .regex(/^[A-Za-z]{0,2}$/, 'Deve essere un codice ISO di 2 lettere o vuoto'),
    language: z
      .string()
      .max(2)
      .regex(/^[A-Za-z]{0,2}$/, 'Deve essere un codice ISO di 2 lettere o vuoto'),
    requalifyAfterDays: z.coerce.number().int().min(1),
    inactiveDays: z.coerce.number().int().min(1),
  })
  .refine((d) => d.minSubscribers < d.maxSubscribers, {
    message: 'Iscritti minimi deve essere minore degli iscritti massimi',
    path: ['minSubscribers'],
  });

export async function updateFiltersAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = FiltersSchema.safeParse({
    minSubscribers: formData.get('minSubscribers'),
    maxSubscribers: formData.get('maxSubscribers'),
    country: formData.get('country'),
    language: formData.get('language'),
    requalifyAfterDays: formData.get('requalifyAfterDays'),
    inactiveDays: formData.get('inactiveDays'),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Dati non validi' };
  }
  try {
    await updateFilters(parsed.data);
    revalidatePath('/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Errore durante il salvataggio' };
  }
}

const PipelineConfigSchema = z.object({
  keywordsPerRun: z.coerce.number().int().min(1).max(70),
  targetQualifiedPerRun: z.coerce.number().int().min(1).max(200),
});

export async function updatePipelineConfigAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = PipelineConfigSchema.safeParse({
    keywordsPerRun: formData.get('keywordsPerRun'),
    targetQualifiedPerRun: formData.get('targetQualifiedPerRun'),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Dati non validi' };
  }
  try {
    await updatePipelineConfig(parsed.data);
    revalidatePath('/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Errore durante il salvataggio' };
  }
}

export async function createKeywordAction(input: {
  keyword: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createKeyword(input);
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    if (err instanceof KeywordAlreadyExists) {
      return { ok: false, error: 'duplicate' };
    }
    return { ok: false, error: 'unknown' };
  }
}

export async function updateKeywordAction(input: {
  id: number;
  isActive?: boolean;
  notes?: string;
}): Promise<void> {
  const { id, ...patch } = input;
  await updateKeyword(id, patch);
  revalidatePath('/settings');
}

export async function deleteKeywordAction(input: { id: number }): Promise<void> {
  await deleteKeyword(input.id);
  revalidatePath('/settings');
}
