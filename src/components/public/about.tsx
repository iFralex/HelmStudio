import { getTranslations } from 'next-intl/server';
import { SectionBadge } from './section-badge';
import { HighlightedHeading } from './highlighted-heading';

type Fact = { label: string; value: string };

export async function About() {
  const t = await getTranslations('About');
  const facts = t.raw('facts') as Fact[];

  return (
    <section className="relative">
      <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
        <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />

        <HighlightedHeading
          text={t('title')}
          className="mt-10 text-[clamp(2rem,5.5vw,5rem)] max-w-[18ch]"
          baseDelay={120}
          stagger={60}
        />

        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-12 md:gap-16 lg:gap-24 items-start">
          {/* Left — manifesto paragraphs */}
          <div className="space-y-6 md:space-y-7 max-w-2xl">
            <p className="text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
              {t('origin')}
            </p>
            <p className="text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
              {t('differentiation')}
            </p>
            <p className="text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
              {t('people')}
            </p>

            <p
              className="font-display font-semibold text-2xl md:text-3xl lg:text-4xl leading-tight tracking-tight pt-4 border-t-2 border-brutal-fg/15 mt-8"
              style={{ lineHeight: 1.15 }}
            >
              <span aria-hidden className="text-brutal-accent mr-2">“</span>
              {t('manifesto')}
              <span aria-hidden className="text-brutal-accent ml-1">”</span>
            </p>
          </div>

          {/* Right — studio fact sheet */}
          <aside className="md:sticky md:top-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted mb-5">
              ↳ {t('factsLabel')}
            </p>
            <dl className="border-2 border-brutal-fg bg-brutal-bg">
              {facts.map((f, i) => (
                <div
                  key={f.label}
                  className={
                    'grid grid-cols-[auto_1fr] gap-4 px-4 py-3 ' +
                    (i < facts.length - 1 ? 'border-b-2 border-brutal-fg/15' : '')
                  }
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted self-center">
                    {f.label}
                  </dt>
                  <dd className="font-display font-medium text-sm md:text-base text-brutal-fg text-right">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </section>
  );
}
