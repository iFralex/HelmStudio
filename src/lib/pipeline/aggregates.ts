import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { videos } from '../db/schema';

type Db = ReturnType<typeof getDb>;

export type ChannelAggregates = {
  uploadsPerWeekLast90d: number;
  avgDurationSeconds: number;
  durationStddevSeconds: number;
  avgViews: number;
  distinctCategories: number;
  titleLengthStddev: number;
};

const ZERO_AGGREGATES: ChannelAggregates = {
  uploadsPerWeekLast90d: 0,
  avgDurationSeconds: 0,
  durationStddevSeconds: 0,
  avgViews: 0,
  distinctCategories: 0,
  titleLengthStddev: 0,
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = avg(values);
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export async function computeChannelAggregates(
  channelId: string,
  db: Db = getDb(),
): Promise<ChannelAggregates> {
  const rows = db
    .select({
      title: videos.title,
      publishedAt: videos.publishedAt,
      durationSeconds: videos.durationSeconds,
      viewCount: videos.viewCount,
      categoryId: videos.categoryId,
    })
    .from(videos)
    .where(eq(videos.channelId, channelId))
    .orderBy(desc(videos.publishedAt))
    .limit(20)
    .all();

  if (rows.length < 3) return { ...ZERO_AGGREGATES };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const uploadsLast90d = rows.filter((r) => r.publishedAt >= ninetyDaysAgo).length;
  const uploadsPerWeekLast90d = uploadsLast90d / (90 / 7);

  const durations = rows
    .filter((r): r is typeof r & { durationSeconds: number } => r.durationSeconds !== null)
    .map((r) => r.durationSeconds);
  const avgDurationSeconds = avg(durations);
  const durationStddevSeconds = stddev(durations);

  const views = rows
    .filter((r): r is typeof r & { viewCount: number } => r.viewCount !== null)
    .map((r) => r.viewCount);
  const avgViews = avg(views);

  const distinctCategories = new Set(
    rows.map((r) => r.categoryId).filter((c): c is string => c !== null),
  ).size;

  const titleLengthStddev = stddev(rows.map((r) => r.title.length));

  return {
    uploadsPerWeekLast90d,
    avgDurationSeconds,
    durationStddevSeconds,
    avgViews,
    distinctCategories,
    titleLengthStddev,
  };
}
