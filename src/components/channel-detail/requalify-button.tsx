'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/ui/copy';

export function RequalifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? copy.channelDetail.requalifying : copy.channelDetail.requalifyButton}
    </Button>
  );
}
