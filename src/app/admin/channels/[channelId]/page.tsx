import { notFound } from 'next/navigation';
import { getChannelDetail } from '@/lib/db/queries';
import { ChannelInfo } from '@/components/channel-detail/channel-info';
import { SampleVideosList } from '@/components/channel-detail/sample-videos-list';
import { AssessmentCard } from '@/components/channel-detail/assessment-card';
import { AgentReasoningPanel } from '@/components/channel-detail/agent-reasoning-panel';
import { OutreachWidget } from '@/components/channel-detail/outreach-widget';
import {
  requalifyChannel,
  saveEmailAndDraft,
  regenerateDraft,
  updateDraftSubject,
  updateDraftBody,
  markOutreachStatus,
  updateOutreachNotes,
} from './actions';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function ChannelDetailPage({ params }: PageProps) {
  const { channelId } = await params;
  const detail = await getChannelDetail(channelId);

  if (!detail) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
        {/* Left column: channel info + sample videos */}
        <div className="space-y-6">
          <ChannelInfo channel={detail.channel} />
          <SampleVideosList videos={detail.videos} />
        </div>

        {/* Middle column: AI assessment + agent reasoning */}
        <div className="space-y-6">
          <AssessmentCard
            qualification={detail.qualification}
            channelId={channelId}
            videos={detail.videos}
            requalifyAction={requalifyChannel}
          />
          <AgentReasoningPanel
            videoSelection={detail.videoSelection}
            videos={detail.videos}
            transcriptsByVideo={detail.transcriptsByVideo}
          />
        </div>

        {/* Right column: outreach widget */}
        <div className="space-y-4">
          <OutreachWidget
            channel={detail.channel}
            currentDraft={detail.currentDraft}
            draftHistory={detail.draftHistory}
            saveEmailAndDraftAction={saveEmailAndDraft}
            regenerateDraftAction={regenerateDraft}
            updateDraftSubjectAction={updateDraftSubject}
            updateDraftBodyAction={updateDraftBody}
            markOutreachStatusAction={markOutreachStatus}
            updateOutreachNotesAction={updateOutreachNotes}
          />
        </div>
      </div>
    </div>
  );
}
