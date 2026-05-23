import { dashboardSnapshot, todayLlmStats } from '@/lib/db/queries';
import { isRunActive } from '@/lib/pipeline/lifecycle';
import { RunStatusCard } from '@/components/dashboard/run-status-card';
import { QuotaCard } from '@/components/dashboard/quota-card';
import { QueuesCard } from '@/components/dashboard/queues-card';
import { LlmCard } from '@/components/dashboard/llm-card';
import { TopRecentGrid } from '@/components/dashboard/top-recent-grid';
import { DashboardPoller } from '@/components/dashboard/dashboard-poller';
import { copy } from '@/lib/ui/copy';

export default async function DashboardPage() {
  const [snapshot, llmStats, runStatus] = await Promise.all([
    dashboardSnapshot(),
    todayLlmStats(),
    isRunActive(),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <DashboardPoller active={runStatus.active} />
      <h1 className="text-2xl font-semibold">{copy.dashboard.title}</h1>
      <RunStatusCard
        initialRun={snapshot.latestRun}
        initialActive={runStatus.active}
        initialRunId={runStatus.runId}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuotaCard quota={snapshot.quota} />
        <QueuesCard queues={snapshot.queues} />
        <LlmCard stats={llmStats} />
      </div>
      <TopRecentGrid channels={snapshot.topRecent} />
    </div>
  );
}
