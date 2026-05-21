'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/ui/copy';
import type { Transcript } from '@/lib/db/queries';

function langToFlag(lang: string): string {
  const code = lang.slice(0, 2).toUpperCase();
  return [...code]
    .map((c) => String.fromCodePoint((c.codePointAt(0) ?? 65) + 127397))
    .join('');
}

interface TranscriptModalProps {
  videoId: string;
  videoTitle: string;
  transcript: Transcript | null;
}

export function TranscriptModal({ videoTitle, transcript }: TranscriptModalProps) {
  const title = copy.channelDetail.transcriptModalTitle(videoTitle);

  const renderBody = () => {
    if (!transcript || !transcript.fetchSucceeded) {
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">{copy.channelDetail.transcriptUnavailable}</p>
          {transcript?.fetchError && (
            <p className="text-xs text-destructive font-mono">{transcript.fetchError}</p>
          )}
        </div>
      );
    }

    const text = transcript.text ?? '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 6) {
      paragraphs.push(sentences.slice(i, i + 6).join(' '));
    }

    const lang = transcript.language ?? null;
    const charCount = transcript.characterCount ?? text.length;

    return (
      <div className="space-y-3">
        <div
          className="max-h-[80vh] overflow-y-auto text-sm leading-relaxed space-y-3 pr-1"
          role="document"
        >
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
          {lang && (
            <span>
              {langToFlag(lang)} {lang}
            </span>
          )}
          <span>{copy.channelDetail.transcriptCharCount(charCount)}</span>
          <span>{copy.channelDetail.transcriptSource}</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-xs">
            {copy.channelDetail.viewTranscript}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm leading-snug">{title}</DialogTitle>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
