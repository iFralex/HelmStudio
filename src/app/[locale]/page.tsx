import { setRequestLocale, getTranslations } from 'next-intl/server';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="min-h-screen px-6 md:px-12 lg:px-20 py-16 md:py-24">
      <section className="max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brutal-muted mb-8">
          {t('Site.name')} · Milano
        </p>

        <h1 className="font-display font-bold text-5xl md:text-7xl lg:text-8xl leading-[0.95] tracking-tight">
          {t('Home.heroTitle').split(/(\bAI\b|\bsu misura\b|\bbespoke\b|\bcontent creators\b)/i).map((chunk, i) => {
            const isAccent = /^(AI|su misura|bespoke|content creators)$/i.test(chunk);
            return isAccent ? (
              <span key={i} className="relative inline-block">
                {chunk}
                <span
                  aria-hidden
                  className="absolute left-0 right-0 bottom-1 h-3 md:h-4 bg-brutal-accent -z-10"
                />
              </span>
            ) : (
              <span key={i}>{chunk}</span>
            );
          })}
        </h1>

        <p className="mt-10 text-lg md:text-xl max-w-2xl leading-relaxed text-brutal-fg/80">
          {t('Home.heroSubtitle')}
        </p>

        <div className="mt-12 flex flex-wrap gap-5 items-center">
          <a
            href={`/${locale}/contatti`}
            className="inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-[transform,box-shadow] duration-100"
          >
            {t('Home.ctaPrimary')}
            <span aria-hidden>→</span>
          </a>
          <a
            href={`/${locale}/come-funziona`}
            className="inline-flex items-center gap-2 bg-brutal-bg text-brutal-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg hover:bg-brutal-fg hover:text-brutal-bg transition-colors duration-100"
          >
            {t('Home.ctaSecondary')}
          </a>
        </div>
      </section>

      <p className="mt-32 font-mono text-xs uppercase tracking-widest text-brutal-muted">
        Placeholder · {locale.toUpperCase()} · v0
      </p>
    </main>
  );
}
