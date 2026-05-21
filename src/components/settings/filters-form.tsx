'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import type { FiltersSetting } from '@/lib/services/settings';
import { copy } from '@/lib/ui/copy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateFiltersAction } from '@/app/(app)/settings/actions';

interface Props {
  filters: FiltersSetting;
}

function Field({
  id,
  label,
  type = 'text',
  defaultValue,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  defaultValue: string | number;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue}
        maxLength={maxLength}
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? copy.settings.exportRunning : copy.settings.saveFilters}
    </Button>
  );
}

export function FiltersForm({ filters }: Props) {
  const [state, formAction] = useActionState(updateFiltersAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(copy.settings.filtersSaved);
    } else {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="minSubscribers"
          label={copy.settings.minSubscribers}
          type="number"
          defaultValue={filters.minSubscribers}
        />
        <Field
          id="maxSubscribers"
          label={copy.settings.maxSubscribers}
          type="number"
          defaultValue={filters.maxSubscribers}
        />
        <Field
          id="country"
          label={copy.settings.country}
          defaultValue={filters.country}
          maxLength={2}
        />
        <Field
          id="language"
          label={copy.settings.language}
          defaultValue={filters.language}
          maxLength={2}
        />
        <Field
          id="requalifyAfterDays"
          label={copy.settings.requalifyAfterDays}
          type="number"
          defaultValue={filters.requalifyAfterDays}
        />
        <Field
          id="inactiveDays"
          label={copy.settings.inactiveDays}
          type="number"
          defaultValue={filters.inactiveDays}
        />
      </div>
      <SubmitButton />
    </form>
  );
}
