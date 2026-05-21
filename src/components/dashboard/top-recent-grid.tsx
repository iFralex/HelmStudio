import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { copy } from '@/lib/ui/copy';

interface TopChannel {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  score: number;
  nicheClassification: string;
}

interface TopRecentGridProps {
  channels: TopChannel[];
}

function scoreVariant(score: number): 'default' | 'secondary' | 'outline' {
  if (score >= 70) return 'default';
  if (score >= 40) return 'secondary';
  return 'outline';
}

export function TopRecentGrid({ channels }: TopRecentGridProps) {
  if (channels.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {copy.dashboard.noData}
        </CardContent>
      </Card>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">{copy.dashboard.topRecent}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {channels.map((ch) => (
          <Link key={ch.channelId} href={`/channels/${ch.channelId}`}>
            <Card className="hover:ring-primary/40 transition-shadow cursor-pointer h-full">
              <CardContent className="p-3 space-y-2">
                {ch.thumbnailUrl ? (
                  <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                    <Image
                      src={ch.thumbnailUrl}
                      alt={ch.title}
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-2xl font-bold">
                    {ch.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium leading-tight truncate">{ch.title}</p>
                  {ch.handle && (
                    <p className="text-xs text-muted-foreground truncate">{ch.handle}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant={scoreVariant(ch.score)} className="text-xs">
                    {ch.score}
                  </Badge>
                  {ch.nicheClassification && (
                    <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                      {ch.nicheClassification}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
