import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import type { CaseStudy } from '@/components/public/case-data';

export default async function CaseStudiesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('CaseStudies');
  const cases = t.raw('cases') as CaseStudy[];

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-16 pb-20 md:pt-24 md:pb-28">
          <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />
          <HighlightedHeading
            text={t('indexTitle')}
            className="mt-10 text-[clamp(2.25rem,6vw,5.5rem)] max-w-[20ch]"
            baseDelay={120}
            stagger={60}
          />
          <p className="mt-8 max-w-2xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {t('indexIntro')}
          </p>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
            {cases.map((c) => (
              <CaseCard
                key={c.slug}
                locale={locale}
                c={c}
                readMoreLabel={t('cardReadMore')}
              />
            ))}
          </div>
        </div>
      </section>

      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28 text-center">
          <HighlightedHeading
            text={t('ctaTitle')}
            className="mx-auto text-[clamp(2rem,5vw,4rem)] max-w-[22ch]"
            baseDelay={80}
            stagger={50}
          />
          <p className="mt-6 max-w-xl mx-auto text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {t('ctaBody')}
          </p>
          <Link
            href="/contatti"
            className="mt-10 inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base md:text-lg px-7 py-3.5 border-2 border-brutal-fg shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-[transform,box-shadow] duration-100"
          >
            {t('ctaLabel')}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <HazardStripe reverse delay={0} />
    </>
  );
}

function CaseCard({
  locale,
  c,
  readMoreLabel,
}: {
  locale: string;
  c: CaseStudy;
  readMoreLabel: string;
}) {
  return (
    <Link
      href={`/casi-studio/${c.slug}`}
      className="group block border-2 border-brutal-fg bg-brutal-bg shadow-brutal-sm hover:shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 transition-[transform,box-shadow] duration-100"
    >
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted">
            {c.tag}
          </span>
          <span
            aria-hidden
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted"
          >
            ·
          </span>
          <span className="inline-flex items-center justify-center px-2 py-0.5 border-2 border-brutal-fg bg-brutal-accent text-brutal-accent-fg font-mono text-[10px] uppercase tracking-[0.18em]">
            {c.language}
          </span>
        </div>

        <h2
          className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight"
          style={{ lineHeight: 1.05 }}
        >
          {c.channelName}
        </h2>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-brutal-muted">
          {c.channelHandle} · {c.subscribers}
        </p>

        <p className="mt-6 text-base md:text-lg text-brutal-fg/85 leading-relaxed">
          {c.summary}
        </p>

        <p className="mt-6 inline-flex items-center gap-2 font-mono text-sm uppercase tracking-[0.18em] text-brutal-fg group-hover:text-brutal-accent transition-colors">
          {readMoreLabel}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </p>
      </div>
    </Link>
  );
}
