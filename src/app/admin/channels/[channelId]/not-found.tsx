import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copy } from '@/lib/ui/copy';

export default function ChannelNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
      <p className="text-muted-foreground">{copy.channelDetail.notFound}</p>
      <Link href="/admin/channels" className={cn(buttonVariants({ variant: 'default' }))}>
        {copy.channels.title}
      </Link>
    </div>
  );
}
