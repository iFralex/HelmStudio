import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { Header } from '@/components/public/header';
import { Footer } from '@/components/public/footer';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Seo' });
  // Locale-aware fallback that fills in when a leaf page doesn't define its
  // own generateMetadata. Leaf pages override `title` and `description`
  // wholesale, so this only kicks in on routes that haven't been wired yet.
  return {
    metadataBase: new URL(env.SITE_URL),
    title: { default: t('home.title'), template: `%s${t('defaultTitleSuffix')}` },
    description: t('defaultDescription'),
  };
}

const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'HELM Studio',
  legalName: 'HELM Studio SRL',
  url: env.SITE_URL,
  logo: `${env.SITE_URL}/icon.svg`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Via Giuseppe Mazzini 9',
    postalCode: '20123',
    addressLocality: 'Milano',
    addressRegion: 'MI',
    addressCountry: 'IT',
  },
  email: env.CONTACT_EMAIL_TO,
  sameAs: [] as string[],
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <NextIntlClientProvider>
      {/* Organization structured data — emitted once in the public layout so
          every public page inherits it. Search engines use this for the
          knowledge panel and brand disambiguation. */}
      <script
        type="application/ld+json"
        // The JSON is fully under our control — no XSS surface here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
      />
      <div className="bg-brutal-bg text-brutal-fg font-sans min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </NextIntlClientProvider>
  );
}
