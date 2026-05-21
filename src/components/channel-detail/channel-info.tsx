'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy } from '@/lib/ui/copy';
import { cn } from '@/lib/utils';
import { formatCompact, formatDate } from '@/lib/ui/format';
import { deleteChannel } from '@/app/(app)/channels/[channelId]/actions';
import type { Channel } from '@/lib/db/queries';

const CATEGORY_NAMES: Record<string, string> = {
  '2': 'Auto e Veicoli',
  '17': 'Sport',
  '19': 'Viaggi ed eventi',
  '20': 'Giochi',
  '22': 'Persone e Blog',
  '23': 'Commedia',
  '24': 'Intrattenimento',
  '25': 'Notizie e Politica',
  '26': 'Stile e Bellezza',
  '27': 'Istruzione',
  '28': 'Scienza e Tecnologia',
};

function countryFlagEmoji(country: string | null): string {
  if (!country) return '';
  return country
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function parseDiscoverySource(source: string | null): string | null {
  if (!source) return null;
  if (source.startsWith('keyword:')) {
    const kw = source.slice('keyword:'.length);
    return `Trovato via keyword: ${kw}`;
  }
  if (source.startsWith('category:')) {
    const id = source.slice('category:'.length);
    const name = CATEGORY_NAMES[id] ?? id;
    return `Trovato in categoria: ${name}`;
  }
  return source;
}

interface ChannelInfoProps {
  channel: Channel;
}

export function ChannelInfo({ channel }: ChannelInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const description = channel.description ?? '';
  const isLong = description.length > 300;
  const displayedDescription = isLong && !expanded ? description.slice(0, 300) + '…' : description;

  const youtubeUrl = channel.customUrl
    ? `https://youtube.com/${channel.customUrl}`
    : `https://youtube.com/channel/${channel.id}`;

  const discoveryBadge = parseDiscoverySource(channel.discoverySource);
  const flag = countryFlagEmoji(channel.country);

  return (
    <div className="space-y-4">
      {/* Thumbnail + title */}
      <div className="flex items-start gap-3">
        {channel.thumbnailUrl ? (
          <Image
            src={channel.thumbnailUrl}
            alt={channel.title}
            width={80}
            height={80}
            className="rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-muted shrink-0 flex items-center justify-center text-2xl font-bold text-muted-foreground">
            {channel.title.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">{channel.title}</h1>
          {channel.handle && (
            <Link
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:underline"
            >
              {channel.handle}
            </Link>
          )}
          {/* country + language */}
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            {channel.country && (
              <span title={copy.channelDetail.country}>
                {flag} {channel.country}
              </span>
            )}
            {channel.defaultLanguage && (
              <span title={copy.channelDetail.language}>{channel.defaultLanguage}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-sm">
        <div>
          <span className="font-semibold tabular-nums">
            {channel.subscriberCount !== null && channel.subscriberCount !== undefined
              ? formatCompact(channel.subscriberCount)
              : '—'}
          </span>{' '}
          <span className="text-muted-foreground">{copy.channelDetail.subscribers}</span>
        </div>
        <div>
          <span className="font-semibold tabular-nums">
            {channel.videoCount !== null && channel.videoCount !== undefined
              ? formatCompact(channel.videoCount)
              : '—'}
          </span>{' '}
          <span className="text-muted-foreground">{copy.channelDetail.totalVideos}</span>
        </div>
      </div>

      {/* Channel created date */}
      {channel.channelPublishedAt && (
        <p className="text-xs text-muted-foreground">
          {copy.channelDetail.channelCreated}{' '}
          {formatDate(new Date(channel.channelPublishedAt))}
        </p>
      )}

      {/* Description */}
      {description && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {copy.channelDetail.description}
          </p>
          <p className="text-sm whitespace-pre-line break-words">{displayedDescription}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? 'Mostra meno' : 'Mostra altro'}
            </button>
          )}
        </div>
      )}

      {/* Discovery source badge */}
      {discoveryBadge && (
        <Badge variant="outline" className="text-xs">
          {discoveryBadge}
        </Badge>
      )}

      {/* Open on YouTube link */}
      <Link
        href={youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
      >
        {copy.channelDetail.openOnYoutube}
      </Link>

      {/* GDPR delete */}
      <div className="pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
          onClick={() => {
            setConfirmText('');
            setDeleteDialogOpen(true);
          }}
        >
          {copy.channelDetail.deleteChannel}
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{copy.channelDetail.deleteChannelConfirmTitle}</DialogTitle>
            <DialogDescription>{copy.channelDetail.deleteChannelConfirmBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-channel-name" className="text-sm">
              Digita <span className="font-semibold">{channel.title}</span> per confermare
            </Label>
            <Input
              id="confirm-channel-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={channel.title}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {copy.channelDetail.deleteChannelCancel}
            </DialogClose>
            <form action={deleteChannel}>
              <input type="hidden" name="channelId" value={channel.id} />
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmText !== channel.title}
              >
                {copy.channelDetail.deleteChannelConfirmAction}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
