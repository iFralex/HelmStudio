'use server';

import { revalidatePath } from 'next/cache';
import { forceRequalifyChannel } from '@/lib/pipeline/qualification';
import { logger } from '@/lib/logger';

export async function requalifyChannel(formData: FormData): Promise<void> {
  const channelId = formData.get('channelId') as string;
  if (!channelId) return;
  logger.info({ channelId }, 'requalify channel requested');
  await forceRequalifyChannel(channelId);
  revalidatePath(`/channels/${channelId}`);
}
