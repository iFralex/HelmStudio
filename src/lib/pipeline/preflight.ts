import { getDb } from '../db/client';
import { env } from '../env';
import { todayUnitsSpent } from '../youtube/quota';

type Db = ReturnType<typeof getDb>;

const REQUIRED_HEADROOM = 4500;

export class InsufficientQuotaHeadroom extends Error {
  constructor(
    public readonly spent: number,
    public readonly required: number,
  ) {
    super(
      `Need ~${required} units, only ${env.PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - spent} headroom remaining today`,
    );
    this.name = 'InsufficientQuotaHeadroom';
  }
}

export async function preflightChecks(db: Db = getDb()): Promise<void> {
  const spent = todayUnitsSpent(db);
  const cap =
    env.PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT - env.PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER;
  const headroom = cap - spent;
  if (headroom < REQUIRED_HEADROOM) {
    throw new InsufficientQuotaHeadroom(spent, REQUIRED_HEADROOM);
  }
}
