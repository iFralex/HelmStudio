'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { copy } from '@/lib/ui/copy';
import { formatDate, formatRelative } from '@/lib/ui/format';
import type { Channel, OutreachDraft } from '@/lib/db/queries';

interface OutreachWidgetProps {
  channel: Channel;
  currentDraft: OutreachDraft | null;
  draftHistory: OutreachDraft[];
  saveEmailAndDraftAction: (formData: FormData) => Promise<void>;
  regenerateDraftAction: (formData: FormData) => Promise<void>;
  updateDraftSubjectAction: (formData: FormData) => Promise<void>;
  updateDraftBodyAction: (formData: FormData) => Promise<void>;
  markOutreachStatusAction: (formData: FormData) => Promise<void>;
  updateOutreachNotesAction: (formData: FormData) => Promise<void>;
}

export function OutreachWidget({
  channel,
  currentDraft,
  draftHistory,
  saveEmailAndDraftAction,
  regenerateDraftAction,
  updateDraftSubjectAction,
  updateDraftBodyAction,
  markOutreachStatusAction,
  updateOutreachNotesAction,
}: OutreachWidgetProps) {
  const status = channel.outreachStatus;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium">{copy.channelDetail.outreachTitle}</h2>
      {status === 'none' && (
        <NoneView
          channelId={channel.id}
          initialEmail={channel.email ?? ''}
          saveEmailAndDraftAction={saveEmailAndDraftAction}
        />
      )}
      {status === 'email_added' && (
        <EmailAddedView channelId={channel.id} regenerateDraftAction={regenerateDraftAction} />
      )}
      {status === 'drafted' && currentDraft && (
        <DraftedView
          key={currentDraft.id}
          channelId={channel.id}
          draft={currentDraft}
          draftHistory={draftHistory}
          regenerateDraftAction={regenerateDraftAction}
          updateDraftSubjectAction={updateDraftSubjectAction}
          updateDraftBodyAction={updateDraftBodyAction}
          markOutreachStatusAction={markOutreachStatusAction}
        />
      )}
      {status === 'drafted' && !currentDraft && (
        <EmailAddedView channelId={channel.id} regenerateDraftAction={regenerateDraftAction} />
      )}
      {status === 'sent' && currentDraft && (
        <SentView
          channelId={channel.id}
          channel={channel}
          draft={currentDraft}
          markOutreachStatusAction={markOutreachStatusAction}
          updateOutreachNotesAction={updateOutreachNotesAction}
        />
      )}
      {(status === 'replied' || status === 'no_reply' || status === 'ignored') && (
        <FinalView
          channelId={channel.id}
          channel={channel}
          draft={currentDraft}
          markOutreachStatusAction={markOutreachStatusAction}
        />
      )}
    </div>
  );
}

function NoneView({
  channelId,
  initialEmail,
  saveEmailAndDraftAction,
}: {
  channelId: string;
  initialEmail: string;
  saveEmailAndDraftAction: (fd: FormData) => Promise<void>;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('channelId', channelId);
        fd.set('email', email.trim());
        await saveEmailAndDraftAction(fd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.channelDetail.draftGenerationError);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="outreach-email" className="text-xs">
          {copy.channelDetail.emailLabel}
        </Label>
        <Input
          id="outreach-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.channelDetail.emailPlaceholder}
          required
          disabled={isPending}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending} className="w-full">
        {isPending ? copy.channelDetail.generatingDraft : copy.channelDetail.emailSaveButton}
      </Button>
    </form>
  );
}

function EmailAddedView({
  channelId,
  regenerateDraftAction,
}: {
  channelId: string;
  regenerateDraftAction: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime.current) / 1000);
      setElapsed(secs);
      if (secs < 60) {
        router.refresh();
      } else {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [router]);

  if (elapsed >= 60) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{copy.channelDetail.draftGenerationFailed}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set('channelId', channelId);
              await regenerateDraftAction(fd);
            });
          }}
        >
          {isPending ? copy.channelDetail.regenerating : copy.channelDetail.retryButton}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{copy.channelDetail.generatingDraft}</p>
      <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    </div>
  );
}

function DraftedView({
  channelId,
  draft,
  draftHistory,
  regenerateDraftAction,
  updateDraftSubjectAction,
  updateDraftBodyAction,
  markOutreachStatusAction,
}: {
  channelId: string;
  draft: OutreachDraft;
  draftHistory: OutreachDraft[];
  regenerateDraftAction: (fd: FormData) => Promise<void>;
  updateDraftSubjectAction: (fd: FormData) => Promise<void>;
  updateDraftBodyAction: (fd: FormData) => Promise<void>;
  markOutreachStatusAction: (fd: FormData) => Promise<void>;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [didCopy, setDidCopy] = useState(false);

  const handleCopy = async () => {
    const text = `${copy.channelDetail.subjectPrefix(subject)}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 2000);
    toast.success(copy.channelDetail.copied);
  };

  const handleSubjectBlur = () => {
    if (subject !== draft.subject) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set('draftId', String(draft.id));
        fd.set('subject', subject);
        await updateDraftSubjectAction(fd);
      });
    }
  };

  const handleBodyBlur = () => {
    if (body !== draft.body) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set('draftId', String(draft.id));
        fd.set('body', body);
        await updateDraftBodyAction(fd);
      });
    }
  };

  const handleRegenerate = () => {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('channelId', channelId);
        await regenerateDraftAction(fd);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : copy.channelDetail.draftGenerationError);
      }
    });
  };

  const handleMarkSent = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('channelId', channelId);
      fd.set('status', 'sent');
      await markOutreachStatusAction(fd);
    });
  };

  const previousDrafts = draftHistory.filter((d) => d.id !== draft.id);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">{copy.channelDetail.draftSubject}</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={handleSubjectBlur}
          disabled={isPending}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{copy.channelDetail.draftBody}</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={handleBodyBlur}
          disabled={isPending}
          rows={12}
          className="text-sm font-mono resize-y"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} disabled={isPending}>
          {didCopy ? copy.channelDetail.copied : copy.channelDetail.copyToClipboard}
        </Button>
        <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={isPending}>
          {isPending ? copy.channelDetail.regenerating : copy.channelDetail.regenerate}
        </Button>
        <Button size="sm" onClick={handleMarkSent} disabled={isPending}>
          {copy.channelDetail.markAsSent}
        </Button>
      </div>
      {previousDrafts.length > 0 && (
        <div>
          <Separator className="my-2" />
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setShowHistory((v) => !v)}
          >
            {copy.channelDetail.draftHistory} ({previousDrafts.length})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1">
              {previousDrafts.map((d) => (
                <DraftHistoryRow key={d.id} draft={d} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SentView({
  channelId,
  channel,
  draft,
  markOutreachStatusAction,
  updateOutreachNotesAction,
}: {
  channelId: string;
  channel: Channel;
  draft: OutreachDraft;
  markOutreachStatusAction: (fd: FormData) => Promise<void>;
  updateOutreachNotesAction: (fd: FormData) => Promise<void>;
}) {
  const [notes, setNotes] = useState(channel.outreachNotes ?? '');
  const [isPending, startTransition] = useTransition();

  const handleStatus = (status: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('channelId', channelId);
      fd.set('status', status);
      await markOutreachStatusAction(fd);
    });
  };

  const handleNotesBlur = () => {
    if (notes !== (channel.outreachNotes ?? '')) {
      startTransition(async () => {
        const fd = new FormData();
        fd.set('channelId', channelId);
        fd.set('notes', notes);
        await updateOutreachNotesAction(fd);
      });
    }
  };

  return (
    <div className="space-y-3">
      {channel.outreachSentAt && (
        <div className="rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-2 text-sm font-medium">
          {copy.channelDetail.sentAt(formatDate(channel.outreachSentAt))}
        </div>
      )}
      <ReadOnlyDraft draft={draft} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleStatus('replied')}
          disabled={isPending}
        >
          {copy.channelDetail.markAsReplied}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleStatus('no_reply')}
          disabled={isPending}
        >
          {copy.channelDetail.markAsNoReply}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleStatus('ignored')}
          disabled={isPending}
        >
          {copy.channelDetail.markAsIgnored}
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{copy.channelDetail.notesLabel}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder={copy.channelDetail.notesPlaceholder}
          rows={3}
          className="text-sm"
          disabled={isPending}
        />
      </div>
    </div>
  );
}

function FinalView({
  channelId,
  channel,
  draft,
  markOutreachStatusAction,
}: {
  channelId: string;
  channel: Channel;
  draft: OutreachDraft | null;
  markOutreachStatusAction: (fd: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const statusLabel: Record<string, string> = {
    replied: copy.channelDetail.markAsReplied,
    no_reply: copy.channelDetail.markAsNoReply,
    ignored: copy.channelDetail.markAsIgnored,
  };

  const handleReopen = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('channelId', channelId);
      fd.set('status', 'drafted');
      await markOutreachStatusAction(fd);
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
        {statusLabel[channel.outreachStatus] ?? channel.outreachStatus}
      </div>
      {draft && <ReadOnlyDraft draft={draft} />}
      {channel.outreachNotes && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{channel.outreachNotes}</p>
      )}
      <Button size="sm" variant="outline" onClick={handleReopen} disabled={isPending}>
        {copy.channelDetail.reopen}
      </Button>
    </div>
  );
}

function ReadOnlyDraft({ draft }: { draft: OutreachDraft }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          {copy.channelDetail.draftSubject}:
        </span>
        <p className="text-sm mt-0.5">{draft.subject}</p>
      </div>
      <Separator />
      <div>
        <span className="text-xs font-medium text-muted-foreground">
          {copy.channelDetail.draftBody}:
        </span>
        <p className="text-xs mt-0.5 whitespace-pre-wrap font-mono leading-relaxed">{draft.body}</p>
      </div>
    </div>
  );
}

function DraftHistoryRow({ draft }: { draft: OutreachDraft }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs text-muted-foreground">
      <span>{formatRelative(draft.createdAt)}</span>
      <Dialog>
        <DialogTrigger className="hover:underline text-xs">
          {copy.channelDetail.viewDraft}
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm pr-8">{draft.subject}</DialogTitle>
          </DialogHeader>
          <p className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{draft.body}</p>
          <p className="text-xs text-muted-foreground">
            {formatRelative(draft.createdAt)} · {draft.modelUsed}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
