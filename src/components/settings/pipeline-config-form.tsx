'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import type { PipelineConfigSetting } from '@/lib/services/settings';
import { copy } from '@/lib/ui/copy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePipelineConfigAction } from '@/app/(app)/settings/actions';

interface Props {
  config: PipelineConfigSetting;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? copy.settings.exportRunning : copy.settings.savePipelineConfig}
    </Button>
  );
}

export function PipelineConfigForm({ config }: Props) {
  const [state, formAction] = useActionState(updatePipelineConfigAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(copy.settings.pipelineConfigSaved);
    } else {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="keywordsPerRun">{copy.settings.keywordsPerRun}</Label>
          <Input
            id="keywordsPerRun"
            name="keywordsPerRun"
            type="number"
            min={1}
            max={70}
            defaultValue={config.keywordsPerRun}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetQualifiedPerRun">{copy.settings.targetQualifiedPerRun}</Label>
          <Input
            id="targetQualifiedPerRun"
            name="targetQualifiedPerRun"
            type="number"
            min={1}
            max={200}
            defaultValue={config.targetQualifiedPerRun}
          />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
