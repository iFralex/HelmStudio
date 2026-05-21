'use client';

import { useState, useTransition, useRef } from 'react';
import { toast } from 'sonner';
import type { SeedKeyword } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/ui/format';
import {
  createKeywordAction,
  updateKeywordAction,
  deleteKeywordAction,
} from '@/app/(app)/settings/actions';

interface Props {
  keywords: SeedKeyword[];
}

function AddKeywordForm() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const keyword = (data.get('keyword') as string).trim();
    const notes = (data.get('notes') as string).trim() || undefined;
    if (!keyword) return;
    startTransition(async () => {
      const result = await createKeywordAction({ keyword, notes });
      if (result.ok) {
        toast.success(copy.settings.keywordAdded);
        formRef.current?.reset();
      } else if (result.error === 'duplicate') {
        toast.error(`"${keyword}" è già presente.`);
      } else {
        toast.error('Errore durante l\'aggiunta.');
      }
    });
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-medium">{copy.settings.addKeywordTitle}</h3>
      <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="newKeyword" className="sr-only">
            {copy.settings.columnKeyword}
          </Label>
          <Input
            id="newKeyword"
            name="keyword"
            placeholder={copy.settings.newKeywordPlaceholder}
            disabled={isPending}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="newKeywordNotes" className="sr-only">
            {copy.settings.columnNotes}
          </Label>
          <Input
            id="newKeywordNotes"
            name="notes"
            placeholder={copy.settings.newKeywordNotesPlaceholder}
            disabled={isPending}
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {copy.settings.addKeywordButton}
        </Button>
      </form>
    </div>
  );
}

function KeywordRow({ kw }: { kw: SeedKeyword }) {
  const [isPending, startTransition] = useTransition();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(kw.notes ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleToggle() {
    startTransition(async () => {
      await updateKeywordAction({ id: kw.id, isActive: !kw.isActive });
      toast.success(copy.settings.keywordUpdated);
    });
  }

  function handleSaveNotes() {
    startTransition(async () => {
      await updateKeywordAction({ id: kw.id, notes: notesValue || undefined });
      toast.success(copy.settings.keywordUpdated);
      setEditingNotes(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteKeywordAction({ id: kw.id });
      toast.success(copy.settings.keywordDeleted);
      setDeleteOpen(false);
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{kw.keyword}</TableCell>
      <TableCell>
        <Badge variant={kw.isActive ? 'default' : 'secondary'}>
          {kw.isActive ? copy.settings.activate : copy.settings.deactivate}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {kw.lastUsedAt ? formatDate(kw.lastUsedAt) : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">{kw.totalUses}</TableCell>
      <TableCell className="text-right tabular-nums">{kw.totalCandidatesProduced}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {editingNotes ? (
          <div className="flex gap-1 items-center">
            <Input
              className="h-7 text-sm"
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNotes();
                if (e.key === 'Escape') setEditingNotes(false);
              }}
              autoFocus
              disabled={isPending}
            />
            <Button size="sm" variant="ghost" onClick={handleSaveNotes} disabled={isPending}>
              ✓
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditingNotes(false)}
              disabled={isPending}
            >
              ✕
            </Button>
          </div>
        ) : (
          <button
            className="text-left w-full hover:underline"
            onClick={() => setEditingNotes(true)}
          >
            {kw.notes ?? '—'}
          </button>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1 justify-end">
          <Button variant="outline" size="sm" onClick={handleToggle} disabled={isPending}>
            {kw.isActive ? copy.settings.deactivate : copy.settings.activate}
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" disabled={isPending}>
                  {copy.settings.deleteKeyword}
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{copy.settings.deleteKeywordConfirm}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{kw.keyword}</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
                  Annulla
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                  {copy.settings.deleteKeyword}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function KeywordsSection({ keywords }: Props) {
  return (
    <div className="space-y-6">
      <AddKeywordForm />

      {keywords.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.settings.columnKeyword}</TableHead>
              <TableHead>{copy.settings.columnIsActive}</TableHead>
              <TableHead>{copy.settings.columnLastUsedAt}</TableHead>
              <TableHead className="text-right">{copy.settings.columnTotalUses}</TableHead>
              <TableHead className="text-right">{copy.settings.columnTotalCandidates}</TableHead>
              <TableHead>{copy.settings.columnNotes}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((kw) => (
              <KeywordRow key={kw.id} kw={kw} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
