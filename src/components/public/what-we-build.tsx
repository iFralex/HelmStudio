import { getTranslations, getLocale } from 'next-intl/server';
import { SectionBadge } from './section-badge';
import { HighlightedHeading } from './highlighted-heading';
import { WhatWeBuildMarquee, type WorkflowItem } from './what-we-build-marquee';

export async function WhatWeBuild() {
  const t = await getTranslations('WhatWeBuild');
  const locale = await getLocale();
  const items = t.raw('items') as WorkflowItem[];
  const dialog = t.raw('dialog') as {
    problemLabel: string;
    solutionLabel: string;
    exampleLabel: string;
    timeSavedLabel: string;
    ctaLabel: string;
    closeLabel: string;
  };

  return (
    <section className="relative">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-24 md:pt-32 pb-12 md:pb-16">
        <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />

        <HighlightedHeading
          text={t('title')}
          className="mt-10 text-[clamp(2.25rem,6vw,5.5rem)] max-w-[16ch]"
          baseDelay={120}
          stagger={60}
        />

        <p className="mt-8 max-w-2xl text-lg md:text-xl text-brutal-fg/80 leading-relaxed">
          {t('intro')}
        </p>

        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
          ↓ {t('tapToExplore')}
        </p>
      </div>

      <WhatWeBuildMarquee
        items={items}
        labels={{
          ...dialog,
          tapToExplore: t('tapToExplore'),
          contactHref: `/${locale}/contatti`,
        }}
      />
    </section>
  );
}
