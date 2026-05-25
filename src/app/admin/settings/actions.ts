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
      .regex(/^([A-Za-z]{2})?$/, 'Deve essere un codice ISO di 2 lettere o vuoto'),
    language: z
      .string()
      .regex(/^([A-Za-z]{2})?$/, 'Deve essere un codice ISO di 2 lettere o vuoto'),
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
    revalidatePath('/admin/settings');
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
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Errore durante il salvataggio' };
  }
}

const CreateKeywordSchema = z.object({
  keyword: z.string().min(1).max(200).trim(),
  notes: z.string().max(1000).optional(),
});

export async function createKeywordAction(input: {
  keyword: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = CreateKeywordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'empty' };
  try {
    await createKeyword(parsed.data);
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (err) {
    if (err instanceof KeywordAlreadyExists) {
      return { ok: false, error: 'duplicate' };
    }
    return { ok: false, error: 'unknown' };
  }
}

const UpdateKeywordSchema = z.object({
  id: z.number().int().positive(),
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function updateKeywordAction(input: {
  id: number;
  isActive?: boolean;
  notes?: string | null;
}): Promise<ActionResult> {
  const parsed = UpdateKeywordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  try {
    const { id, ...patch } = parsed.data;
    await updateKeyword(id, patch);
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore durante l'aggiornamento" };
  }
}

export async function deleteKeywordAction(input: { id: number }): Promise<ActionResult> {
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  try {
    await deleteKeyword(parsed.data.id);
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: "Errore durante l'eliminazione" };
  }
}
