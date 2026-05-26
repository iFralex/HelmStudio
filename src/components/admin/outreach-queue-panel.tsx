'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { copy } from '@/lib/ui/copy';
import { useOutreachQueue } from '@/lib/outreach/use-outreach-queue';
import {
  buildOutreachCommand,
  outreachCommandFilename,
  OUTREACH_SENDER,
} from '@/lib/outreach/build-command';

/**
 * Floating queue panel mounted in the admin layout. Visible globally so the
 * admin can curate a batch across multiple channel-detail pages, then open
 * one .command file at the end.
 *
 * The trigger button is hidden until at least one item is queued (no point
 * shouting an empty cart at the user).
 */
export function OutreachQueuePanel() {
  const { items, hydrated, remove, clear } = useOutreachQueue();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!hydrated || items.length === 0) return null;

  const handleDownload = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/outreach/batch/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelIds: items.map((i) => i.channelId) }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const { token } = (await res.json()) as { token: string };

        const callbackUrl = `${window.location.origin}/api/outreach/batch/consume`;

        const fileContent = buildOutreachCommand({
          items: items.map((i) => ({
            channelId: i.channelId,
            channelTitle: i.channelTitle,
            recipientEmail: i.recipientEmail,
            subject: i.subject,
            body: i.body,
          })),
          token,
          callbackUrl,
        });

        // Trigger download via a temporary <a> blob URL.
        const blob = new Blob([fileContent], { type: 'application/x-sh' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outreachCommandFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(copy.outreachQueue.downloadSuccess);

        // Clear the local queue: the batch is committed server-side now,
        // re-downloading would just regenerate identical drafts (Mail.app
        // does not deduplicate).
        clear();
        setOpen(false);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('outreach batch download failed', err);
        toast.error(copy.outreachQueue.downloadError);
      }
    });
  };

  const countLabel =
    items.length === 1
      ? copy.outreachQueue.countSingular(items.length)
      : copy.outreachQueue.countPlural(items.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="default"
            size="sm"
            className="fixed bottom-6 right-6 z-50 shadow-lg gap-2"
          >
            {copy.outreachQueue.triggerLabel}
            <Badge variant="secondary" className="px-1.5">
              {items.length}
            </Badge>
          </Button>
        }
      />

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.outreachQueue.title}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {countLabel} · {copy.outreachQueue.sender}: <code>{OUTREACH_SENDER}</code>
        </p>

        <Separator />

        <ul className="max-h-72 overflow-y-auto divide-y">
          {items.map((item) => (
            <li
              key={item.channelId}
              className="flex items-start justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.channelTitle}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.recipientEmail} · {item.subject}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(item.channelId)}
                className="shrink-0"
              >
                {copy.outreachQueue.removeItem}
              </Button>
            </li>
          ))}
        </ul>

        <Separator />

        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">{copy.outreachQueue.senderRequirementTitle}.</strong>{' '}
            {copy.outreachQueue.senderRequirementBody(OUTREACH_SENDER)}
          </p>
          <p>
            <strong className="text-foreground">{copy.outreachQueue.chmodHintTitle}</strong>{' '}
            {copy.outreachQueue.chmodHintBody}
          </p>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={clear} disabled={isPending}>
            {copy.outreachQueue.clearButton}
          </Button>
          <Button onClick={handleDownload} disabled={isPending}>
            {isPending
              ? copy.outreachQueue.downloadingButton
              : copy.outreachQueue.downloadButton}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
