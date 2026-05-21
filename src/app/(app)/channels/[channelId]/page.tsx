import { notFound } from 'next/navigation';
import { getChannelDetail } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function ChannelDetailPage({ params }: PageProps) {
  const { channelId } = await params;
  const detail = await getChannelDetail(channelId);

  if (!detail) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
        {/* Left column: channel info + sample videos */}
        <div className="space-y-4">
          <div className="text-muted-foreground text-sm">{copy.channelDetail.recentVideos}</div>
        </div>

        {/* Middle column: AI assessment + agent reasoning */}
        <div className="space-y-4">
          <div className="text-muted-foreground text-sm">{copy.channelDetail.assessmentTitle}</div>
        </div>

        {/* Right column: outreach widget */}
        <div className="space-y-4">
          <div className="text-muted-foreground text-sm">{copy.channelDetail.outreachTitle}</div>
        </div>
      </div>
    </div>
  );
}
