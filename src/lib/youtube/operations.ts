import { youtube_v3 } from 'googleapis';
import { getYoutube } from './client';
import { checkAndRecordQuota, pacificDateString } from './quota';
import { dumpRaw } from '../storage/raw';
import { paths, tsForFilename, slugify } from '../storage/paths';
import { env } from '../env';
import { withYoutubeLimit } from './limiter';
import { withRetry } from './retry';
import type { ChannelDetail, VideoDetail } from './types';
import { parseIso8601Duration } from './duration';

type Db = Parameters<typeof checkAndRecordQuota>[2];

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function parseIntOrNull(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseDurationSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    return parseIso8601Duration(iso);
  } catch {
    return null;
  }
}

function mapChannel(item: youtube_v3.Schema$Channel): ChannelDetail {
  return {
    id: item.id ?? '',
    handle: item.snippet?.customUrl?.replace(/^@/, '') ?? null,
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? null,
    country: item.snippet?.country ?? null,
    defaultLanguage: item.snippet?.defaultLanguage ?? null,
    customUrl: item.snippet?.customUrl ?? null,
    subscriberCount: parseIntOrNull(item.statistics?.subscriberCount),
    viewCount: parseIntOrNull(item.statistics?.viewCount),
    videoCount: parseIntOrNull(item.statistics?.videoCount),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
    channelPublishedAt: item.snippet?.publishedAt ?? null,
  };
}

function mapVideo(item: youtube_v3.Schema$Video): VideoDetail {
  return {
    id: item.id ?? '',
    channelId: item.snippet?.channelId ?? '',
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? null,
    publishedAt: item.snippet?.publishedAt ?? '',
    duration: item.contentDetails?.duration ?? null,
    durationSeconds: parseDurationSeconds(item.contentDetails?.duration),
    viewCount: parseIntOrNull(item.statistics?.viewCount),
    likeCount: parseIntOrNull(item.statistics?.likeCount),
    commentCount: parseIntOrNull(item.statistics?.commentCount),
    thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
    tags: item.snippet?.tags ?? null,
    categoryId: item.snippet?.categoryId ?? null,
    defaultLanguage: item.snippet?.defaultLanguage ?? null,
    defaultAudioLanguage: item.snippet?.defaultAudioLanguage ?? null,
  };
}

export async function searchChannels(
  params: {
    query: string;
    pageToken?: string;
    maxResults?: number;
    regionCode?: string;
    relevanceLanguage?: string;
    runId?: number;
  },
  db?: Db,
): Promise<{ channelIds: string[]; nextPageToken: string | null; rawPath: string }> {
  checkAndRecordQuota('search.list', params.runId, db);

  const yt = getYoutube();
  const res = await withRetry(() =>
    withYoutubeLimit(() =>
      yt.search.list({
        part: ['id'],
        type: ['channel'],
        q: params.query,
        maxResults: params.maxResults ?? 50,
        regionCode: params.regionCode ?? env.PIPELINE_TARGET_COUNTRY,
        relevanceLanguage: params.relevanceLanguage ?? env.PIPELINE_TARGET_LANGUAGE,
        ...(params.pageToken ? { pageToken: params.pageToken } : {}),
      }),
    ),
  );

  const date = pacificDateString();
  const ts = tsForFilename();
  const slug = slugify(params.query);
  const rawPath = await dumpRaw(paths.rawYoutubeSearch(date, slug, ts), res.data);

  const channelIds = (res.data.items ?? [])
    .map((item) => item.id?.channelId)
    .filter((id): id is string => !!id);

  return {
    channelIds,
    nextPageToken: res.data.nextPageToken ?? null,
    rawPath,
  };
}

export async function getChannels(
  params: {
    ids: string[];
    runId?: number;
  },
  db?: Db,
): Promise<{ channels: ChannelDetail[]; rawPaths: Record<string, string> }> {
  const batches = chunk(params.ids, 50);
  const allChannels: ChannelDetail[] = [];
  const rawPaths: Record<string, string> = {};

  for (const batch of batches) {
    checkAndRecordQuota('channels.list', params.runId, db);

    const yt = getYoutube();
    const res = await withRetry(() =>
      withYoutubeLimit(() =>
        yt.channels.list({
          part: ['id', 'snippet', 'statistics', 'contentDetails'],
          id: batch,
          maxResults: 50,
        }),
      ),
    );

    const ts = tsForFilename();
    for (const item of res.data.items ?? []) {
      const channelId = item.id;
      if (!channelId) continue;

      const rawPath = await dumpRaw(paths.rawYoutubeChannelMeta(channelId, ts), item);
      rawPaths[channelId] = rawPath;
      allChannels.push(mapChannel(item));
    }
  }

  return { channels: allChannels, rawPaths };
}

export async function getMostPopularByCategory(
  params: {
    categoryId: string;
    regionCode?: string;
    maxResults?: number;
    runId?: number;
  },
  db?: Db,
): Promise<{ channelIds: string[]; rawPath: string }> {
  checkAndRecordQuota('videos.list', params.runId, db);

  const yt = getYoutube();
  const res = await withRetry(() =>
    withYoutubeLimit(() =>
      yt.videos.list({
        part: ['snippet'],
        chart: 'mostPopular',
        videoCategoryId: params.categoryId,
        regionCode: params.regionCode ?? env.PIPELINE_TARGET_COUNTRY,
        maxResults: params.maxResults ?? 50,
      }),
    ),
  );

  const ts = tsForFilename();
  const rawPath = await dumpRaw(paths.rawYoutubePopular(params.categoryId, ts), res.data);

  const seen = new Set<string>();
  const channelIds: string[] = [];
  for (const item of res.data.items ?? []) {
    const cid = item.snippet?.channelId;
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      channelIds.push(cid);
    }
  }

  return { channelIds, rawPath };
}

export async function getUploadsPlaylistItems(
  params: {
    playlistId: string;
    maxResults?: number;
    runId?: number;
  },
  db?: Db,
): Promise<{ videoIds: string[]; rawPath: string }> {
  checkAndRecordQuota('playlistItems.list', params.runId, db);

  const yt = getYoutube();
  const res = await withRetry(() =>
    withYoutubeLimit(() =>
      yt.playlistItems.list({
        part: ['contentDetails'],
        playlistId: params.playlistId,
        maxResults: params.maxResults ?? 20,
      }),
    ),
  );

  // Derive channel ID from uploads playlist ID (UU... → UC...)
  const channelIdForPath = params.playlistId.startsWith('UU')
    ? 'UC' + params.playlistId.slice(2)
    : params.playlistId;

  const ts = tsForFilename();
  const rawPath = await dumpRaw(paths.rawYoutubeChannelUploads(channelIdForPath, ts), res.data);

  const videoIds = (res.data.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => !!id);

  return { videoIds, rawPath };
}

export async function getVideos(
  params: {
    ids: string[];
    channelIdForStorage: string;
    runId?: number;
  },
  db?: Db,
): Promise<{ videos: VideoDetail[]; rawPath: string | null }> {
  const batches = chunk(params.ids, 50);
  const allVideos: VideoDetail[] = [];
  let lastRawPath: string | null = null;

  for (const batch of batches) {
    checkAndRecordQuota('videos.list', params.runId, db);

    const yt = getYoutube();
    const res = await withRetry(() =>
      withYoutubeLimit(() =>
        yt.videos.list({
          part: ['id', 'snippet', 'statistics', 'contentDetails'],
          id: batch,
          maxResults: 50,
        }),
      ),
    );

    const ts = tsForFilename();
    const rawPath = await dumpRaw(
      paths.rawYoutubeVideosBatch(params.channelIdForStorage, ts),
      res.data,
    );
    lastRawPath = rawPath;

    for (const item of res.data.items ?? []) {
      allVideos.push(mapVideo(item));
    }
  }

  return { videos: allVideos, rawPath: lastRawPath };
}
