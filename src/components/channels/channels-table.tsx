import type { Channel, Qualification } from '@/lib/db/queries';

export interface ChannelsTableProps {
  rows: Array<Channel & { latestQualification: Qualification | null }>;
}

export function ChannelsTable({ rows }: ChannelsTableProps) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{rows.length} canali trovati</p>
    </div>
  );
}
