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
  evidenceTier?: 'TIER_1' | 'TIER_2' | 'TIER_3';
  evidenceBasis?: string;
  estimatedTimeSavedPerVideoMinutes: number;
  timeSavedReasoning?: string;
  productReadiness?: 'off_the_shelf' | 'buildable_6mo' | 'research_phase';
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

const TIER_CLASSES: Record<string, string> = {
  TIER_1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  TIER_2: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  TIER_3: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const TIER_LABELS: Record<string, string> = {
  TIER_1: 'T1 — esplicito',
  TIER_2: 'T2 — osservato',
  TIER_3: 'T3 — inferito',
};

const READINESS_CLASSES: Record<string, string> = {
  off_the_shelf: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  buildable_6mo: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  research_phase: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

interface SubScoreBarProps {
  label: string;
  value: number | null | undefined;
}

function SubScoreBar({ label, value }: SubScoreBarProps) {
  if (value === null || value === undefined) return null;
  const color =
    value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-gray-400';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

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

  const analysisMode = qualification.analysisMode as 'evidence_driven' | 'inferred' | null;
  const hasSubScores =
    qualification.workflowRepeatabilityScore !== null &&
    qualification.workflowRepeatabilityScore !== undefined;
  const salesObjections = (qualification.salesObjections as string[] | null) ?? [];
  const advocateConcerns = (qualification.advocateConcerns as string[] | null) ?? [];
  const hasAdvocateReview = qualification.advocateApproved !== null && qualification.advocateApproved !== undefined;

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
          {analysisMode && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                analysisMode === 'evidence_driven'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
              )}
            >
              {analysisMode === 'evidence_driven'
                ? copy.channelDetail.analysisModeEvidenceDriven
                : copy.channelDetail.analysisModeInferred}
            </span>
          )}
          {qualification.confidence !== null && qualification.confidence !== undefined && (
            <span className="text-sm text-muted-foreground">
              {copy.channelDetail.confidence}: {Math.round(qualification.confidence)}%
            </span>
          )}
        </div>
      </div>

      {/* Sub-score breakdown */}
      {hasSubScores && (
        <section className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {copy.channelDetail.scoreBreakdown}
          </p>
          <SubScoreBar
            label={copy.channelDetail.scoreWorkflowRepeatability}
            value={qualification.workflowRepeatabilityScore}
          />
          <SubScoreBar
            label={copy.channelDetail.scoreEvidenceStrength}
            value={qualification.evidenceStrengthScore}
          />
          <SubScoreBar
            label={copy.channelDetail.scoreCommercialViability}
            value={qualification.commercialViabilityScore}
          />
        </section>
      )}

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
              <div key={i} className="rounded-lg border p-3 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{wf.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {wf.evidenceTier && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                          TIER_CLASSES[wf.evidenceTier] ?? TIER_CLASSES['TIER_3'],
                        )}
                      >
                        {TIER_LABELS[wf.evidenceTier] ?? wf.evidenceTier}
                      </span>
                    )}
                    {wf.productReadiness && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                          READINESS_CLASSES[wf.productReadiness],
                        )}
                      >
                        {copy.channelDetail.productReadiness[wf.productReadiness]}
                      </span>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {copy.channelDetail.timeSavedPerVideo(wf.estimatedTimeSavedPerVideoMinutes)}
                    </Badge>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">{wf.description}</p>
                <p className="text-xs">{wf.automationApproach}</p>
                {wf.evidenceBasis && (
                  <p className="text-xs text-muted-foreground italic">
                    <span className="font-medium not-italic">
                      {copy.channelDetail.evidenceBasisLabel}:{' '}
                    </span>
                    {wf.evidenceBasis}
                  </p>
                )}
                {wf.timeSavedReasoning && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      {copy.channelDetail.timeSavedReasoning}
                    </summary>
                    <p className="mt-1 pl-2 border-l">{wf.timeSavedReasoning}</p>
                  </details>
                )}
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
          <div className="space-y-2">
            <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                {disqualifiers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
            {qualification.disqualifierScoreImpact && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">
                  {copy.channelDetail.disqualifierScoreImpact}:{' '}
                </span>
                {qualification.disqualifierScoreImpact}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.channelDetail.noDisqualifiers}</p>
        )}
      </section>

      {/* Obiezioni di vendita previste */}
      {salesObjections.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {copy.channelDetail.salesObjections}
          </h3>
          <ul className="space-y-1">
            {salesObjections.map((obj, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-muted-foreground shrink-0 mt-0.5">–</span>
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Revisione avvocato del diavolo */}
      {hasAdvocateReview && (
        <section className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {copy.channelDetail.advocateTitle}
            </p>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                qualification.advocateApproved
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              )}
            >
              {qualification.advocateApproved
                ? copy.channelDetail.advocateApproved
                : copy.channelDetail.advocateRejected}
            </span>
            {!qualification.advocateApproved && qualification.advocateRevisedFinal !== null && (
              <span className="text-xs text-muted-foreground">
                {copy.channelDetail.advocateOriginalScore(
                  qualification.workflowRepeatabilityScore
                    ? Math.round(
                        (qualification.workflowRepeatabilityScore * 0.4 +
                          (qualification.evidenceStrengthScore ?? 0) * 0.35 +
                          (qualification.commercialViabilityScore ?? 0) * 0.25),
                      )
                    : (qualification.automationPotentialScore ?? 0),
                )}{' '}
                → {copy.channelDetail.advocateRevisedScore(qualification.advocateRevisedFinal)}
              </span>
            )}
          </div>
          {advocateConcerns.length > 0 ? (
            <ul className="space-y-1">
              {advocateConcerns.map((c, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{copy.channelDetail.advocateNoConcerns}</p>
          )}
        </section>
      )}

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
