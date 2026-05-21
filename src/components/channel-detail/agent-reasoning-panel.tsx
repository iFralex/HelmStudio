'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BrainIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { copy } from '@/lib/ui/copy';
import { TranscriptModal } from './transcript-modal';
import type { VideoSelection, Video, Transcript } from '@/lib/db/queries';

type VideoClassification = {
  videoId: string;
  classification: 'format_anchor' | 'representative' | 'extemporaneous' | 'outlier';
  reasoning: string;
  automationRelevanceScore: number;
};

const CLASSIFICATION_VARIANT: Record<
  VideoClassification['classification'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  format_anchor: 'default',
  representative: 'secondary',
  extemporaneous: 'outline',
  outlier: 'destructive',
};

interface AgentReasoningPanelProps {
  videoSelection: VideoSelection | null;
  videos: Video[];
  transcriptsByVideo: Map<string, Transcript | null>;
}

export function AgentReasoningPanel({
  videoSelection,
  videos,
  transcriptsByVideo,
}: AgentReasoningPanelProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (!videoSelection) {
    return null;
  }

  const classifications = (
    videoSelection.videoClassifications as VideoClassification[] | null
  ) ?? [];
  const selectedIds = new Set((videoSelection.selectedVideoIds as string[] | null) ?? []);
  const videoMap = new Map(videos.map((v) => [v.id, v]));

  return (
    <div className="space-y-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <BrainIcon className="size-4 text-muted-foreground" />
        {copy.channelDetail.whyTheseVideosTitle}
      </h2>

      {videoSelection.formatConsistencySummary && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {copy.channelDetail.formatConsistency}
          </h3>
          <blockquote className="border-l-4 border-muted pl-3 text-sm italic text-muted-foreground leading-relaxed">
            {videoSelection.formatConsistencySummary}
          </blockquote>
        </section>
      )}

      {videoSelection.selectionRationale && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {copy.channelDetail.selectionRationale}
          </h3>
          <p className="text-sm leading-relaxed">{videoSelection.selectionRationale}</p>
        </section>
      )}

      {classifications.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {copy.channelDetail.classificationTable}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 p-1" />
                <TableHead className="text-xs">{copy.channelDetail.columnClassification}</TableHead>
                <TableHead className="text-xs w-20">
                  {copy.channelDetail.columnRelevance}
                </TableHead>
                <TableHead className="text-xs">{copy.channelDetail.columnReasoning}</TableHead>
                <TableHead className="w-8 p-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {classifications.map((c) => {
                const video = videoMap.get(c.videoId);
                const isSelected = selectedIds.has(c.videoId);
                const transcript = transcriptsByVideo.get(c.videoId) ?? null;
                const isExpanded = expandedRow === c.videoId;

                return (
                  <TableRow
                    key={c.videoId}
                    className={isSelected ? 'border-l-2 border-emerald-500' : undefined}
                  >
                    <TableCell className="p-1 w-8">
                      {video?.thumbnailUrl ? (
                        <Image
                          src={video.thumbnailUrl}
                          alt={video.title ?? ''}
                          width={24}
                          height={14}
                          className="rounded object-cover"
                          style={{ width: 24, height: 14 }}
                        />
                      ) : (
                        <div className="w-6 h-3.5 bg-muted rounded" />
                      )}
                    </TableCell>
                    <TableCell className="p-1">
                      <div className="space-y-1">
                        {video ? (
                          <a
                            href={`https://youtu.be/${video.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs hover:underline line-clamp-2"
                          >
                            {video.title}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">{c.videoId}</span>
                        )}
                        <Badge variant={CLASSIFICATION_VARIANT[c.classification]} className="mt-0.5">
                          {copy.channelDetail.classificationLabel[c.classification]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="p-1 w-20">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {c.automationRelevanceScore}/10
                        </span>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${c.automationRelevanceScore * 10}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="p-1 max-w-xs">
                      <button
                        type="button"
                        className="text-xs text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : c.videoId)}
                        title={c.reasoning}
                      >
                        <span className={isExpanded ? undefined : 'line-clamp-2'}>
                          {c.reasoning}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="p-1 w-8">
                      {isSelected && (
                        <TranscriptModal
                          videoId={c.videoId}
                          videoTitle={video?.title ?? c.videoId}
                          transcript={transcript}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
