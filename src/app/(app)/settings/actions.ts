'use server';

import { revalidatePath } from 'next/cache';
import {
  createKeyword,
  updateKeyword,
  deleteKeyword,
  KeywordAlreadyExists,
} from '@/lib/db/queries';

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
