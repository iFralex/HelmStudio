import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import { HowItWorks } from '@/components/public/how-it-works';
import { WhatWeBuild } from '@/components/public/what-we-build';
import { About } from '@/components/public/about';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Hero');

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint relative overflow-hidden">
        {/* Decorative right-margin stamp: a rotated mono badge that "lands" */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-10 right-6 md:right-12 lg:right-20 hidden sm:block animate-brutal-stamp"
          style={{ animationDelay: '900ms' }}
        >
          <div className="border-2 border-brutal-fg bg-brutal-bg px-3 py-2 -rotate-3 shadow-brutal-sm font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted">
            Milano · 2026
          </div>
        </div>

        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="animate-brutal-fade-up" style={{ animationDelay: '60ms' }}>
            <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />
          </div>

          <HighlightedHeading
            text={t('title')}
            className="mt-10 text-[clamp(2.5rem,8vw,7rem)] max-w-[18ch]"
            baseDelay={220}
            stagger={75}
          />

          {/* Schema settimane — typographic, no cards. Two big numbers with inline
              text, connected by a hand-drawn scribble arrow in the accent colour. */}
          <div
            className="mt-14 animate-brutal-fade-up opacity-0"
            style={{ animationDelay: '1200ms' }}
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <WeekStep number="01" text={t('weekOneText')} />
              <ScribbleArrow />
              <WeekStep number="02" text={t('weekTwoText')} />
            </div>
            <p className="mt-4 font-mono text-[11px] md:text-xs uppercase tracking-[0.22em] text-brutal-muted max-w-[44ch]">
              {t('footnote')}
            </p>
          </div>

          <div
            className="mt-12 flex flex-wrap items-center gap-5 animate-brutal-fade-up opacity-0"
            style={{ animationDelay: '1400ms' }}
          >
            <Link
              href="/contatti"
              className="group inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-[transform,box-shadow] duration-100"
            >
              {t('ctaPrimary')}
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href="/come-funziona"
              className="inline-flex items-center gap-2 bg-brutal-bg text-brutal-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg hover:bg-brutal-fg hover:text-brutal-bg transition-colors duration-100"
            >
              {t('ctaSecondary')}
            </Link>

            <span
              className="hidden md:inline-block font-mono text-xs uppercase tracking-[0.22em] text-brutal-muted -rotate-2 ml-2"
              aria-hidden
            >
              ↖ {t('annotation')}
            </span>
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={300} />

      <HowItWorks />

      <HazardStripe delay={0} />

      <WhatWeBuild />

      <HazardStripe reverse delay={0} />

      <About />

      <HazardStripe delay={0} />
    </>
  );
}

function WeekStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-baseline gap-3 md:gap-4">
      <span className="font-display font-bold text-5xl md:text-6xl lg:text-7xl leading-none tabular-nums">
        {number}
      </span>
      <span className="font-display font-medium text-xl md:text-2xl lg:text-3xl text-brutal-fg/85 lowercase">
        {text}
      </span>
    </div>
  );
}

function ScribbleArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 32"
      className="w-20 md:w-28 lg:w-32 h-auto shrink-0 text-brutal-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Hand-drawn marker squiggle from left to right with a small overshoot,
          then a soft arrowhead. Drawn as if with the same pen as the highlights. */}
      <path d="M 4 22 C 22 8, 44 26, 66 14 S 96 22, 110 16" />
      <path d="M 110 16 L 100 9" />
      <path d="M 110 16 L 100 24" />
    </svg>
  );
}
