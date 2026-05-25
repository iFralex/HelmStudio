import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import { FaqItem } from '@/components/public/faq-item';

type Step = {
  number: string;
  title: string;
  body: string;
  youGive: string;
  youGet: string;
  timeline: string;
};

type FaqEntry = { q: string; a: string };

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HowItWorksPage');
  const steps = t.raw('steps') as Step[];
  const pricingBullets = t.raw('pricingBullets') as string[];
  const faq = t.raw('faq') as FaqEntry[];

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

      {/* Steps in dettaglio ────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('stepsTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[22ch]"
            baseDelay={60}
            stagger={50}
          />

          <div className="mt-20 md:mt-24 space-y-20 md:space-y-24">
            {steps.map((s) => (
              <DetailedStep
                key={s.number}
                step={s}
                giveLabel={t('stepGiveLabel')}
                getLabel={t('stepGetLabel')}
                timelineLabel={t('stepTimelineLabel')}
              />
            ))}
          </div>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Pricing ───────────────────────────────────────── */}
      <section className="bg-brutal-bg">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-12 md:gap-16 lg:gap-24 items-start">
            <div>
              <HighlightedHeading
                text={t('pricingTitle')}
                className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[20ch]"
                baseDelay={60}
                stagger={50}
              />
              <p className="mt-8 max-w-xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
                {t('pricingBody')}
              </p>
            </div>

            <ul className="space-y-4 md:pt-4">
              {pricingBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span
                    aria-hidden
                    className="font-mono text-brutal-accent text-xl leading-none shrink-0 mt-1"
                  >
                    ▪
                  </span>
                  <span className="text-base md:text-lg text-brutal-fg/85 leading-snug">
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* FAQ ───────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <HighlightedHeading
            text={t('faqTitle')}
            className="text-[clamp(1.75rem,4.5vw,3.75rem)] max-w-[20ch]"
            baseDelay={60}
            stagger={50}
          />

          <div className="mt-12 md:mt-16 max-w-4xl">
            {faq.map((entry, i) => (
              <FaqItem key={i} q={entry.q} a={entry.a} />
            ))}
          </div>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Final CTA ─────────────────────────────────────── */}
      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28 text-center">
          <HighlightedHeading
            text={t('ctaTitle')}
            className="mx-auto text-[clamp(2.25rem,6vw,5rem)] max-w-[18ch]"
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

function DetailedStep({
  step,
  giveLabel,
  getLabel,
  timelineLabel,
}: {
  step: Step;
  giveLabel: string;
  getLabel: string;
  timelineLabel: string;
}) {
  return (
    <article className="border-t-2 border-brutal-fg/20 pt-12 md:pt-16">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-12 lg:gap-16">
        <span className="font-display font-bold text-7xl md:text-8xl lg:text-9xl leading-none tabular-nums text-brutal-fg">
          {step.number}
        </span>

        <div className="max-w-3xl">
          <h3
            className="font-display font-bold text-2xl md:text-4xl lg:text-5xl tracking-tight"
            style={{ lineHeight: 1.05 }}
          >
            {step.title}
          </h3>
          <p className="mt-5 text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {step.body}
          </p>

          <dl className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 border-l-2 border-brutal-fg/15 pl-5 sm:border-l-0 sm:pl-0">
            <Slot label={giveLabel} value={step.youGive} />
            <Slot label={getLabel} value={step.youGet} />
            <Slot label={timelineLabel} value={step.timeline} />
          </dl>
        </div>
      </div>
    </article>
  );
}

function Slot({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted mb-2">
        {label}
      </dt>
      <dd className="font-display font-medium text-sm md:text-base text-brutal-fg leading-snug">
        {value}
      </dd>
    </div>
  );
}
