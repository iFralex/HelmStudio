import { getTranslations } from 'next-intl/server';
import { SectionBadge } from './section-badge';
import { HighlightedHeading } from './highlighted-heading';

export async function HowItWorks() {
  const t = await getTranslations('HowItWorks');

  const steps = [
    {
      number: t('step01Number'),
      title: t('step01Title'),
      body: t('step01Body'),
      annotation: t('step01Annotation'),
    },
    {
      number: t('step02Number'),
      title: t('step02Title'),
      body: t('step02Body'),
      annotation: t('step02Annotation'),
    },
    {
      number: t('step03Number'),
      title: t('step03Title'),
      body: t('step03Body'),
      annotation: t('step03Annotation'),
    },
  ];

  return (
    <section className="relative">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
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

        <ol className="mt-20 md:mt-24 relative">
          {steps.map((step, i) => (
            <li
              key={step.number}
              className={
                'relative grid grid-cols-[auto_1fr] gap-x-6 md:gap-x-10 lg:gap-x-16 items-start ' +
                (i > 0 ? 'mt-16 md:mt-20' : '')
              }
            >
              <span className="font-display font-bold text-6xl md:text-8xl lg:text-[9rem] leading-[0.85] tabular-nums select-none">
                {step.number}
              </span>

              <div className="max-w-2xl pt-2 md:pt-4">
                <h3 className="font-display font-bold text-2xl md:text-3xl lg:text-4xl tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-3 md:mt-4 text-base md:text-lg text-brutal-fg/80 leading-relaxed">
                  {step.body}
                </p>
                <p className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                  <span aria-hidden className="inline-block h-px w-6 bg-brutal-muted" />
                  {step.annotation}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
