import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import { LegalSection, type LegalSectionData } from '@/components/public/legal-section';

/**
 * Shared body for any legal/policy page (Privacy, Cookie, ToS, ...).
 * Reads from the given i18n namespace which must contain:
 *   badgeNumber, badgeLabel, pageTitle (with [marker]),
 *   lastUpdatedLabel, lastUpdated, pageIntro,
 *   sections: LegalSectionData[]
 */
export async function LegalPage({
  locale,
  namespace,
}: {
  locale: string;
  namespace: 'Privacy' | 'Cookie';
}) {
  setRequestLocale(locale);
  const t = await getTranslations(namespace);
  const sections = t.raw('sections') as LegalSectionData[];

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-16 pb-20 md:pt-24 md:pb-28">
          <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />

          <HighlightedHeading
            text={t('pageTitle')}
            className="mt-10 text-[clamp(2.25rem,6vw,5rem)] max-w-[18ch]"
            baseDelay={120}
            stagger={60}
          />

          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
            {t('lastUpdatedLabel')} · {t('lastUpdated')}
          </p>

          <p className="mt-8 max-w-2xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {t('pageIntro')}
          </p>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="space-y-12 md:space-y-16">
            {sections.map((s) => (
              <LegalSection key={s.number} section={s} />
            ))}
          </div>
        </div>
      </section>

      <HazardStripe delay={0} />
    </>
  );
}
