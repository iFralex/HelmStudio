import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';

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

          {/* Schema settimane: two boxes connected by an arrow, blueprint-style */}
          <div
            className="mt-12 grid gap-5 sm:grid-cols-[auto_auto_auto_1fr] items-center max-w-2xl animate-brutal-fade-up opacity-0"
            style={{ animationDelay: '1200ms' }}
          >
            <WeekBox
              label={t('weekOneLabel')}
              text={t('weekOneText')}
              variant="primary"
            />
            <span
              aria-hidden
              className="hidden sm:block font-mono text-2xl text-brutal-fg select-none"
            >
              →
            </span>
            <WeekBox
              label={t('weekTwoLabel')}
              text={t('weekTwoText')}
              variant="secondary"
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brutal-muted sm:pl-2 max-w-[20ch]">
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
    </>
  );
}

function WeekBox({
  label,
  text,
  variant,
}: {
  label: string;
  text: string;
  variant: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <div
      className={
        'border-2 border-brutal-fg w-44 ' +
        (isPrimary
          ? 'bg-brutal-fg text-brutal-bg shadow-brutal'
          : 'bg-brutal-bg text-brutal-fg shadow-brutal-sm')
      }
    >
      <div
        className={
          'font-mono text-[10px] uppercase tracking-[0.22em] px-3 py-1 border-b-2 ' +
          (isPrimary ? 'border-brutal-bg/40' : 'border-brutal-fg')
        }
      >
        {label}
      </div>
      <div className="font-display text-lg font-semibold px-3 py-3">{text}</div>
    </div>
  );
}
