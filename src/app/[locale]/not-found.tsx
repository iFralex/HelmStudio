import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { HighlightedHeading } from '@/components/public/highlighted-heading';

export default async function LocaleNotFound() {
  const t = await getTranslations('NotFound');

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-16 lg:gap-20 items-end">
            <span
              className="font-display font-bold tabular-nums leading-[0.85] text-brutal-fg"
              style={{ fontSize: 'clamp(7rem, 22vw, 18rem)' }}
              aria-hidden
            >
              {t('code')}
            </span>

            <div className="max-w-2xl pb-2 md:pb-4">
              <HighlightedHeading
                text={t('title')}
                className="text-[clamp(1.75rem,4vw,3.5rem)] max-w-[18ch]"
                baseDelay={120}
                stagger={70}
              />
              <p className="mt-6 text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
                {t('body')}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4 md:gap-5">
                <Link
                  href="/"
                  className="group inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-[transform,box-shadow] duration-100"
                >
                  <span aria-hidden className="transition-transform group-hover:-translate-x-1">
                    ←
                  </span>
                  {t('ctaHome')}
                </Link>

                <Link
                  href="/contatti"
                  className="inline-flex items-center gap-2 bg-brutal-bg text-brutal-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg hover:bg-brutal-fg hover:text-brutal-bg transition-colors duration-100"
                >
                  {t('ctaContact')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />
    </>
  );
}
