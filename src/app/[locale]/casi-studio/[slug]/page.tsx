import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import {
  CASE_METADATA,
  CASE_STUDY_SLUGS,
  isCaseSlug,
  type CaseStudy,
} from '@/components/public/case-data';
import { ChannelAvatar } from '@/components/public/channel-avatar';
import { buildPageMetadata } from '@/lib/seo/metadata';

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    CASE_STUDY_SLUGS.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isCaseSlug(slug)) {
    // Falls through to the case-studies index meta — the page itself will 404.
    return buildPageMetadata({ locale, page: 'caseStudies', path: '/casi-studio' });
  }
  const t = await getTranslations({ locale, namespace: 'CaseStudies' });
  const cases = t.raw('cases') as CaseStudy[];
  const c = cases.find((x) => x.slug === slug);
  // Build a per-case title + description from the actual case data so the SERP
  // result for /<locale>/casi-studio/<slug> shows the creator's name and the
  // outcome rather than the generic listing title.
  const title = c
    ? `${c.channelName} — ${c.tag} — HELM Studio`
    : `${slug} — HELM Studio`;
  const description = c?.summary ?? '';
  return buildPageMetadata({
    locale,
    page: 'caseStudies',
    path: `/casi-studio/${slug}`,
    titleOverride: title,
    descriptionOverride: description,
  });
}

export default async function CaseStudyDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isCaseSlug(slug)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('CaseStudies');
  const cases = t.raw('cases') as CaseStudy[];
  const c = cases.find((x) => x.slug === slug);
  if (!c) notFound();
  const meta = CASE_METADATA[slug];

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-10 pb-20 md:pt-14 md:pb-28">
          <Link
            href="/casi-studio"
            className="inline-flex items-center font-mono text-xs uppercase tracking-[0.22em] text-brutal-muted hover:text-brutal-fg transition-colors mb-10"
          >
            {t('backToIndex')}
          </Link>

          <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start">
            <ChannelAvatar
              channelName={c.channelName}
              logoUrl={meta.logoUrl}
              size="lg"
            />

            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                  {c.tag}
                </span>
                <span aria-hidden className="text-brutal-muted">·</span>
                <span className="inline-flex items-center justify-center px-2 py-0.5 border-2 border-brutal-fg bg-brutal-accent text-brutal-accent-fg font-mono text-[10px] uppercase tracking-[0.18em]">
                  {c.language}
                </span>
              </div>

              <h1
                className="mt-3 font-display font-bold text-[clamp(2.5rem,7vw,6rem)] tracking-tight max-w-[14ch]"
                style={{ lineHeight: 0.95 }}
              >
                {c.channelName}
              </h1>
              <p className="mt-2 font-mono text-xs md:text-sm uppercase tracking-[0.18em] text-brutal-muted">
                {c.channelHandle} · {c.subscribers} · {c.format}
              </p>

              <a
                href={meta.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 bg-brutal-bg text-brutal-fg font-display font-semibold text-sm md:text-base px-4 py-2 border-2 border-brutal-fg shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-[transform,box-shadow] duration-100"
              >
                {t('viewChannelLabel')}
                <span aria-hidden>↗</span>
              </a>
            </div>
          </div>

          <figure className="mt-12 max-w-3xl">
            <blockquote
              className="font-display font-semibold text-2xl md:text-3xl lg:text-4xl tracking-tight"
              style={{ lineHeight: 1.2 }}
            >
              <span aria-hidden className="text-brutal-accent mr-2">“</span>
              {c.heroQuote}
              <span aria-hidden className="text-brutal-accent ml-1">”</span>
            </blockquote>
            <figcaption className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
              ↳ {t('translatedFromLabel')} {c.heroQuoteOriginalLang.toLowerCase()}
            </figcaption>
          </figure>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Problem ───────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <SectionLabel label={t('problemLabel')} />
          <p className="mt-6 max-w-3xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {c.problem}
          </p>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Solution ──────────────────────────────────────── */}
      <section className="bg-brutal-bg">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <SectionLabel label={t('solutionLabel')} />
          <p className="mt-6 max-w-3xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {c.solution}
          </p>

          <div className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted mb-4">
              ↳ {t('stackLabel')}
            </p>
            <ul className="flex flex-wrap gap-3">
              {c.stack.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-2 border-2 border-brutal-fg px-3 py-1.5 font-mono text-xs md:text-sm uppercase tracking-[0.14em] bg-brutal-bg"
                >
                  <span aria-hidden className="h-1.5 w-1.5 bg-brutal-fg" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Numbers ───────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <SectionLabel label={t('numbersLabel')} />

          <ul className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {c.metrics.map((m) => (
              <li
                key={m.label}
                className="border-2 border-brutal-fg bg-brutal-bg shadow-brutal-sm p-5 md:p-6"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted mb-4 leading-snug">
                  {m.label}
                </p>
                <div className="flex items-baseline gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-brutal-muted">
                      {t('metricBefore')}
                    </p>
                    <p className="font-display font-semibold text-lg md:text-xl text-brutal-fg/60 line-through decoration-2 decoration-brutal-fg/30">
                      {m.before}
                    </p>
                  </div>
                  <span aria-hidden className="font-mono text-brutal-accent text-xl shrink-0">
                    →
                  </span>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-brutal-muted">
                      {t('metricAfter')}
                    </p>
                    <p className="font-display font-bold text-xl md:text-2xl text-brutal-fg">
                      {m.after}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <HazardStripe delay={0} />

      {/* Final quote ───────────────────────────────────── */}
      <section className="bg-brutal-bg">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-24 md:py-32">
          <SectionLabel label={`${t('quoteLabel')} ${c.finalQuoteAttribution}`} />

          <figure className="mt-10 max-w-4xl">
            <blockquote
              className="font-display font-semibold text-2xl md:text-3xl lg:text-4xl tracking-tight text-brutal-fg"
              style={{ lineHeight: 1.25 }}
            >
              <span aria-hidden className="text-brutal-accent mr-2">“</span>
              {c.finalQuote}
              <span aria-hidden className="text-brutal-accent ml-1">”</span>
            </blockquote>
            <figcaption className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
              — {c.finalQuoteAttribution} · {t('translatedFromLabel')}{' '}
              {c.finalQuoteOriginalLang.toLowerCase()}
            </figcaption>
          </figure>
        </div>
      </section>

      <HazardStripe reverse delay={0} />

      {/* Final CTA ─────────────────────────────────────── */}
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

      <HazardStripe delay={0} />
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="font-mono text-[11px] md:text-xs uppercase tracking-[0.28em] text-brutal-accent">
      ↳ {label}
    </p>
  );
}
