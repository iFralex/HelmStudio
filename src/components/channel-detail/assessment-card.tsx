import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { copy } from '@/lib/ui/copy';
import { scoreColor, formatRelative } from '@/lib/ui/format';
import { RequalifyButton } from './requalify-button';
import type { Qualification, Video } from '@/lib/db/queries';

type AutomatableWorkflow = {
  name: string;
  description: string;
  automationApproach: string;
  estimatedTimeSavedPerVideoMinutes: number;
};

type Signal = {
  type: 'positive' | 'negative';
  evidence: string;
  videoId: string | null;
};

const SCORE_CLASSES: Record<'green' | 'yellow' | 'gray', string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
};

const PITCH_LANG_FLAG: Record<string, string> = {
  it: '🇮🇹',
  en: '🇬🇧',
};

interface AssessmentCardProps {
  qualification: Qualification | null;
  channelId: string;
  videos: Video[];
  requalifyAction: (formData: FormData) => Promise<void>;
}

export function AssessmentCard({
  qualification,
  channelId,
  videos,
  requalifyAction,
}: AssessmentCardProps) {
  const videoMap = new Map(videos.map((v) => [v.id, v]));

  const RequalifyForm = () => (
    <form action={requalifyAction}>
      <input type="hidden" name="channelId" value={channelId} />
      <RequalifyButton />
    </form>
  );

  if (!qualification) {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-medium">{copy.channelDetail.assessmentTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.channelDetail.notQualified}</p>
        <RequalifyForm />
      </div>
    );
  }

  const score = qualification.automationPotentialScore;
  const color = scoreColor(score);
  const workflows = (qualification.automatableWorkflows as AutomatableWorkflow[] | null) ?? [];
  const signals = (qualification.signals as Signal[] | null) ?? [];
  const disqualifiers = (qualification.disqualifiers as string[] | null) ?? [];
  const positiveSignals = signals.filter((s) => s.type === 'positive');
  const negativeSignals = signals.filter((s) => s.type === 'negative');

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-medium">{copy.channelDetail.assessmentTitle}</h2>

      {/* Score badge + metadata row */}
      <div className="flex items-start gap-4 flex-wrap">
        <div
          className={cn(
            'flex items-center justify-center rounded-xl text-2xl font-bold w-16 h-16 shrink-0',
            SCORE_CLASSES[color],
          )}
        >
          {score ?? '—'}
        </div>
        <div className="flex flex-wrap gap-2 items-center pt-1">
          {qualification.nicheClassification && (
            <Badge variant="secondary">{qualification.nicheClassification}</Badge>
          )}
          {qualification.formatType && (
            <Badge variant="outline">{qualification.formatType}</Badge>
          )}
          {qualification.pitchLanguage && (
            <span className="text-sm">
              {PITCH_LANG_FLAG[qualification.pitchLanguage] ?? ''}{' '}
              {qualification.pitchLanguage.toUpperCase()}
            </span>
          )}
          {qualification.confidence !== null && qualification.confidence !== undefined && (
            <span className="text-sm text-muted-foreground">
              {copy.channelDetail.confidence}: {Math.round(qualification.confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Razionale */}
      {qualification.rationale && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {copy.channelDetail.rationale}
          </h3>
          <p className="text-sm leading-relaxed">{qualification.rationale}</p>
        </section>
      )}

      {/* Soluzione suggerita */}
      {qualification.suggestedSolution && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {copy.channelDetail.suggestedSolution}
          </h3>
          <p className="text-sm leading-relaxed">{qualification.suggestedSolution}</p>
        </section>
      )}

      {/* Angolo di pitch */}
      {qualification.pitchAngle && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {copy.channelDetail.pitchAngle}
          </h3>
          <p className="text-sm leading-relaxed">{qualification.pitchAngle}</p>
        </section>
      )}

      {/* Workflow automatizzabili */}
      {workflows.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {copy.channelDetail.automatableWorkflows}
          </h3>
          <div className="space-y-2">
            {workflows.map((wf, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{wf.name}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {copy.channelDetail.timeSavedPerVideo(wf.estimatedTimeSavedPerVideoMinutes)}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{wf.description}</p>
                <p className="text-xs">{wf.automationApproach}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Segnali */}
      {signals.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {copy.channelDetail.signals}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                {copy.channelDetail.positiveSignals}
              </p>
              <ul className="space-y-1.5">
                {positiveSignals.map((s, i) => {
                  const vid = s.videoId ? videoMap.get(s.videoId) : null;
                  return (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      {vid && (
                        <a href={`#video-${vid.id}`} className="shrink-0 mt-0.5">
                          {vid.thumbnailUrl ? (
                            <Image
                              src={vid.thumbnailUrl}
                              alt={vid.title}
                              width={24}
                              height={14}
                              className="rounded object-cover"
                              style={{ width: 24, height: 14 }}
                            />
                          ) : (
                            <div className="w-6 h-3.5 bg-muted rounded" />
                          )}
                        </a>
                      )}
                      <span>{s.evidence}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                {copy.channelDetail.negativeSignals}
              </p>
              <ul className="space-y-1.5">
                {negativeSignals.map((s, i) => {
                  const vid = s.videoId ? videoMap.get(s.videoId) : null;
                  return (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      {vid && (
                        <a href={`#video-${vid.id}`} className="shrink-0 mt-0.5">
                          {vid.thumbnailUrl ? (
                            <Image
                              src={vid.thumbnailUrl}
                              alt={vid.title}
                              width={24}
                              height={14}
                              className="rounded object-cover"
                              style={{ width: 24, height: 14 }}
                            />
                          ) : (
                            <div className="w-6 h-3.5 bg-muted rounded" />
                          )}
                        </a>
                      )}
                      <span>{s.evidence}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Squalificanti */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {copy.channelDetail.disqualifiers}
        </h3>
        {disqualifiers.length > 0 ? (
          <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
            <ul className="list-disc list-inside space-y-1">
              {disqualifiers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.channelDetail.noDisqualifiers}</p>
        )}
      </section>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
        <span>
          {copy.channelDetail.modelUsed}: {qualification.modelUsed}
        </span>
        <span>·</span>
        <span>
          {copy.channelDetail.qualifiedAt}: {formatRelative(qualification.createdAt)}
        </span>
        {qualification.rawResponsePath && (
          <>
            <span>·</span>
            <Link
              href={`/api/raw?path=${encodeURIComponent(qualification.rawResponsePath)}`}
              className="hover:underline"
              target="_blank"
            >
              {copy.channelDetail.rawJsonLink}
            </Link>
          </>
        )}
      </div>

      {/* Riqualifica button */}
      <RequalifyForm />
    </div>
  );
}
