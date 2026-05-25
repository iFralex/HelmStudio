import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';

type Office = {
  city: string;
  address: string;
  kind: 'hq' | 'satellite';
  note: string;
};

type Principle = {
  number: string;
  title: string;
  body: string;
};

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('AboutPage');
  const originParagraphs = t.raw('originParagraphs') as string[];
  const notItems = t.raw('positioningNotItems') as string[];
  const areItems = t.raw('positioningAreItems') as string[];
  const principles = t.raw('manifestoPrinciples') as Principle[];
  const offices = t.raw('offices') as Office[];

  return (
    <>
      <HazardStripe delay={0} />

      {/* Hero ─────────────────────────────────────────── */}
      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-16 pb-20 md:pt-24 md:pb-28">
          <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />
          <HighlightedHeading
            text={t('pageTitle')}
            className="mt-10 text-[clamp(2.25rem,6.5vw,6rem)] max-w-[18ch]"
            baseDelay={120}
            stagger={60}
          />
          <p className="mt-8 max-w-2xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {t('pageIntro')}
          </p>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Origin / Da dove veniamo ──────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('originTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[18ch]"
            baseDelay={60}
            stagger={50}
          />

          <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-16">
            <div className="hidden md:block w-20">
              <ol className="space-y-12">
                {originParagraphs.map((_, i) => (
                  <li
                    key={i}
                    className="font-display font-bold text-5xl lg:text-6xl leading-none tabular-nums text-brutal-fg/30"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-8 md:space-y-12 max-w-3xl">
              {originParagraphs.map((p, i) => (
                <p
                  key={i}
                  className="text-lg md:text-xl text-brutal-fg/85 leading-relaxed"
                >
                  <span className="md:hidden font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted block mb-2">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {p}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Positioning / Cosa siamo vs non siamo ─────────── */}
      <section className="bg-brutal-bg">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('positioningTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[22ch]"
            baseDelay={60}
            stagger={50}
          />
          <p className="mt-6 max-w-2xl text-lg md:text-xl text-brutal-fg/80 leading-relaxed">
            {t('positioningIntro')}
          </p>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
            <PositioningColumn
              label={t('positioningNotLabel')}
              items={notItems}
              variant="negative"
            />
            <PositioningColumn
              label={t('positioningAreLabel')}
              items={areItems}
              variant="positive"
            />
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Manifesto principi ────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('manifestoTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[20ch]"
            baseDelay={60}
            stagger={50}
          />

          <ol className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-y-14 md:gap-y-20 gap-x-12 lg:gap-x-20 max-w-6xl">
            {principles.map((p) => (
              <li key={p.number} className="grid grid-cols-[auto_1fr] gap-5 md:gap-7">
                <span className="font-display font-bold text-5xl md:text-6xl lg:text-7xl leading-none tabular-nums text-brutal-fg/40">
                  {p.number}
                </span>
                <div>
                  <h3
                    className="font-display font-bold text-2xl md:text-3xl lg:text-4xl tracking-tight"
                    style={{ lineHeight: 1.05 }}
                  >
                    {p.title}
                  </h3>
                  <p className="mt-3 text-base md:text-lg text-brutal-fg/80 leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Le sedi ───────────────────────────────────────── */}
      <section className="bg-brutal-bg">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('officesTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[16ch]"
            baseDelay={60}
            stagger={50}
          />
          <p className="mt-6 max-w-2xl text-lg md:text-xl text-brutal-fg/80 leading-relaxed">
            {t('officesIntro')}
          </p>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-5xl">
            {offices.map((o) => (
              <OfficeCard
                key={o.city}
                office={o}
                hqLabel={t('officesHqLabel')}
                satelliteLabel={t('officesSatelliteLabel')}
              />
            ))}
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Final CTA ─────────────────────────────────────── */}
      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28 text-center">
          <HighlightedHeading
            text={t('ctaTitle')}
            className="mx-auto text-[clamp(2.25rem,6vw,5rem)] max-w-[22ch]"
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

      <HazardStripe delay={0} />
    </>
  );
}

function PositioningColumn({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: 'negative' | 'positive';
}) {
  const isNegative = variant === 'negative';
  return (
    <div
      className={
        isNegative
          ? 'border-2 border-brutal-fg/30 p-7 md:p-8 bg-brutal-bg'
          : 'border-2 border-brutal-fg p-7 md:p-8 bg-brutal-bg shadow-brutal-sm'
      }
    >
      <p
        className={
          'font-mono text-[11px] uppercase tracking-[0.22em] mb-6 ' +
          (isNegative ? 'text-brutal-muted' : 'text-brutal-accent')
        }
      >
        {isNegative ? '✕' : '◆'} {label}
      </p>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li
            key={i}
            className={
              'flex items-start gap-3 text-base md:text-lg leading-snug ' +
              (isNegative
                ? 'text-brutal-muted line-through decoration-brutal-fg/40 decoration-2 underline-offset-4'
                : 'text-brutal-fg font-medium')
            }
          >
            <span
              aria-hidden
              className={
                'mt-1.5 shrink-0 ' +
                (isNegative
                  ? 'font-mono text-xs text-brutal-muted'
                  : 'font-mono text-base text-brutal-accent leading-none')
              }
            >
              {isNegative ? '—' : '▪'}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OfficeCard({
  office,
  hqLabel,
  satelliteLabel,
}: {
  office: Office;
  hqLabel: string;
  satelliteLabel: string;
}) {
  const isHq = office.kind === 'hq';
  return (
    <article
      className={
        'border-2 border-brutal-fg p-6 md:p-7 bg-brutal-bg ' +
        (isHq ? 'shadow-brutal' : 'shadow-brutal-sm')
      }
    >
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h3 className="font-display font-bold text-2xl md:text-3xl tracking-tight">
          {office.city}
        </h3>
        <span
          className={
            'font-mono text-[10px] uppercase tracking-[0.22em] shrink-0 px-2 py-1 border-2 ' +
            (isHq
              ? 'border-brutal-fg bg-brutal-fg text-brutal-bg'
              : 'border-brutal-fg/30 text-brutal-muted')
          }
        >
          {isHq ? hqLabel : satelliteLabel}
        </span>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brutal-muted leading-snug">
        {office.address}
      </p>
      <p className="mt-4 text-sm md:text-base text-brutal-fg/85 leading-relaxed">
        {office.note}
      </p>
    </article>
  );
}
