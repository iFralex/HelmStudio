import Image from 'next/image';
import Link from 'next/link';
import { copy } from '@/lib/ui/copy';
import { formatCompact, formatDate } from '@/lib/ui/format';
import type { Video } from '@/lib/db/queries';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface SampleVideosListProps {
  videos: Video[];
}

export function SampleVideosList({ videos }: SampleVideosListProps) {
  const displayed = videos.slice(0, 10);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">{copy.channelDetail.recentVideos}</h2>
      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.channelDetail.noVideos}</p>
      ) : (
        <ul className="space-y-2">
          {displayed.map((video) => (
            <li
              key={video.id}
              id={`video-${video.id}`}
              className="flex items-start gap-2"
            >
              {/* Thumbnail */}
              <Link
                href={`https://youtu.be/${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    width={60}
                    height={34}
                    className="rounded object-cover"
                    style={{ width: 60, height: 34 }}
                  />
                ) : (
                  <div
                    className="bg-muted rounded flex items-center justify-center text-muted-foreground text-xs"
                    style={{ width: 60, height: 34 }}
                  >
                    —
                  </div>
                )}
              </Link>

              {/* Video info */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`https://youtu.be/${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium leading-snug line-clamp-2 hover:underline"
                >
                  {video.title}
                </Link>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span>{formatDate(video.publishedAt)}</span>
                  {video.durationSeconds !== null && video.durationSeconds !== undefined && (
                    <span>{formatDuration(video.durationSeconds)}</span>
                  )}
                  {video.viewCount !== null && video.viewCount !== undefined && (
                    <span>{formatCompact(video.viewCount)} vis.</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
