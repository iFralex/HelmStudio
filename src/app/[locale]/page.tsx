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
    <main className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 text-center">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {t('Site.name')} — {locale}
      </p>
      <h1 className="text-4xl font-bold max-w-2xl">{t('Home.heroTitle')}</h1>
      <p className="text-lg text-muted-foreground max-w-xl">{t('Home.heroSubtitle')}</p>
      <p className="text-xs text-muted-foreground mt-8">
        Marketing site placeholder — full design coming next.
      </p>
    </main>
  );
}
