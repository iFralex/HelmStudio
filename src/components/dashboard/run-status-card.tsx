'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { copy } from '@/lib/ui/copy';
import { formatRelative } from '@/lib/ui/format';
import type { PipelineRun } from '@/lib/db/queries';

interface RunStatusCardProps {
  initialRun: PipelineRun | null;
  initialActive: boolean;
  initialRunId?: number;
}

export function RunStatusCard({ initialRun, initialActive, initialRunId }: RunStatusCardProps) {
  const [run, setRun] = useState(initialRun);
  const [isActive, setIsActive] = useState(initialActive);
  const [runId, setRunId] = useState(initialRunId);
  const [starting, setStarting] = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/pipeline/status').catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setIsActive(data.active.active as boolean);
    setRunId(data.active.runId as number | undefined);
    setRun(data.latestRun as PipelineRun | null);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [isActive, fetchStatus]);

  const handleRun = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' });
      if (res.status === 202) {
        toast.success('Pipeline avviata');
        await fetchStatus();
      } else if (res.status === 409) {
        const data = (await res.json()) as { runId?: number };
        toast.error(`Pipeline già in corso (run #${data.runId ?? '?'})`);
      } else {
        toast.error("Errore durante l'avvio");
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setStarting(false);
    }
  };

  let statusLine: string;
  if (isActive && runId) {
    const processed = run ? run.channelsEnriched + run.channelsQualified : 0;
    statusLine = `Pipeline in corso (run #${runId}, ${processed} canali processati)`;
  } else if (run) {
    const label =
      run.status === 'completed'
        ? 'completato'
        : run.status === 'failed'
          ? 'fallito'
          : 'cancellato';
    statusLine = `Ultimo run #${run.id} ${label} — ${formatRelative(run.startedAt as unknown as Date)}`;
  } else {
    statusLine = copy.dashboard.runCooldown;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stato pipeline</CardTitle>
        <CardAction>
          <Button onClick={handleRun} disabled={isActive || starting} size="sm">
            {isActive ? copy.dashboard.runInProgress : copy.dashboard.runNow}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{statusLine}</p>
      </CardContent>
    </Card>
  );
}
