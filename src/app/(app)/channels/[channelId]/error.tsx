'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
      <h2 className="text-xl font-semibold">Si è verificato un errore</h2>
      <p className="text-muted-foreground max-w-sm">
        Impossibile caricare i dettagli del canale. Riprova o torna alla lista dei canali.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          Riprova
        </Button>
        <Link href="/channels" className={cn(buttonVariants({ variant: 'default' }))}>
          Torna ai canali
        </Link>
      </div>
    </div>
  );
}
