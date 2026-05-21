'use client';

import type { PipelineConfigSetting } from '@/lib/services/settings';
import { copy } from '@/lib/ui/copy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  config: PipelineConfigSetting;
}

export function PipelineConfigForm({ config }: Props) {
  return (
    <form className="space-y-4">
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
      <Button type="submit" disabled>
        {copy.settings.savePipelineConfig}
      </Button>
    </form>
  );
}
