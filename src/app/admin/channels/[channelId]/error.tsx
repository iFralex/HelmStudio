'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copy } from '@/lib/ui/copy';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ChannelDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
      <h2 className="text-xl font-semibold">{copy.channelDetail.errorTitle}</h2>
      <p className="text-muted-foreground max-w-sm">{copy.channelDetail.errorBody}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          {copy.channelDetail.errorRetry}
        </Button>
        <Link href="/admin/channels" className={cn(buttonVariants({ variant: 'default' }))}>
          {copy.channelDetail.errorBackToChannels}
        </Link>
      </div>
    </div>
  );
}
