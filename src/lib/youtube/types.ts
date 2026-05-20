export interface ChannelDetail {
  id: string;
  handle: string | null;
  title: string;
  description: string | null;
  country: string | null;
  defaultLanguage: string | null;
  customUrl: string | null;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  uploadsPlaylistId: string | null;
  thumbnailUrl: string | null;
  channelPublishedAt: string | null;
}

export interface VideoDetail {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  duration: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  thumbnailUrl: string | null;
  tags: string[] | null;
  categoryId: string | null;
  defaultLanguage: string | null;
  defaultAudioLanguage: string | null;
}
