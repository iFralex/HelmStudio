'use client';

import type { SeedKeyword } from '@/lib/db/queries';
import { copy } from '@/lib/ui/copy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/ui/format';

interface Props {
  keywords: SeedKeyword[];
}

export function KeywordsSection({ keywords }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">{copy.settings.addKeywordTitle}</h3>
        <form className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="newKeyword" className="sr-only">
              {copy.settings.columnKeyword}
            </Label>
            <Input
              id="newKeyword"
              name="keyword"
              placeholder={copy.settings.newKeywordPlaceholder}
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
            />
          </div>
          <Button type="submit" disabled>
            {copy.settings.addKeywordButton}
          </Button>
        </form>
      </div>

      {keywords.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.settings.columnKeyword}</TableHead>
              <TableHead>{copy.settings.columnIsActive}</TableHead>
              <TableHead>{copy.settings.columnLastUsedAt}</TableHead>
              <TableHead className="text-right">{copy.settings.columnTotalUses}</TableHead>
              <TableHead className="text-right">
                {copy.settings.columnTotalCandidates}
              </TableHead>
              <TableHead>{copy.settings.columnNotes}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((kw) => (
              <TableRow key={kw.id}>
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
                <TableCell className="text-right tabular-nums">
                  {kw.totalCandidatesProduced}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {kw.notes ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="outline" size="sm" disabled>
                      {kw.isActive ? copy.settings.deactivate : copy.settings.activate}
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      {copy.settings.deleteKeyword}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
