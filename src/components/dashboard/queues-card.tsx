import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { copy } from '@/lib/ui/copy';
import type { DiscoveryStatus, OutreachStatus } from '@/lib/db/queries';

interface QueuesCardProps {
  queues: Record<DiscoveryStatus | OutreachStatus, number>;
}

const QUEUE_ITEMS = [
  {
    label: copy.dashboard.queueCandidates,
    key: 'candidate' as const,
    href: '/channels?status=candidate',
  },
  {
    label: copy.dashboard.queueEnriched,
    key: 'enriched' as const,
    href: '/channels?status=enriched',
  },
  {
    label: copy.dashboard.queueQualifiedNoEmail,
    key: 'qualified' as const,
    href: '/channels?status=qualified',
  },
  {
    label: copy.dashboard.queueDrafted,
    key: 'drafted' as const,
    href: '/channels?outreachStatus=drafted',
  },
  {
    label: copy.dashboard.queueSentNoReply,
    key: 'no_reply' as const,
    href: '/channels?outreachStatus=no_reply',
  },
] satisfies { label: string; key: DiscoveryStatus | OutreachStatus; href: string }[];

export function QueuesCard({ queues }: QueuesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Code</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {QUEUE_ITEMS.map(({ label, key, href }) => (
            <li key={key} className="flex items-center justify-between text-sm">
              <Link href={href} className="text-muted-foreground hover:text-primary transition-colors">
                {label}
              </Link>
              <span className="font-medium tabular-nums">{queues[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
