import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/env';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Builds full Next.js Metadata for a public, locale-aware page.
 *
 * Sets:
 *  - title + description from the `Seo.<page>` namespace in the locale's messages
 *  - canonical to the locale-prefixed URL
 *  - hreflang alternates for every supported locale + `x-default` → default locale
 *  - openGraph + twitter cards using the same title/description and `/og.png`
 *
 * Pages whose path differs across locales (none, currently — all routes are
 * shared) would need the optional `pathByLocale` map. Keeping the API ready
 * for that even though every locale uses the same slug today.
 */
export async function buildPageMetadata(opts: {
  locale: Locale;
  page: 'home' | 'howItWorks' | 'caseStudies' | 'about' | 'contact' | 'privacy' | 'cookie' | 'notFound';
  /** Path relative to the locale prefix, leading slash. e.g. '/contatti'. '' or '/' for home. */
  path: string;
  /** Optional title override (used by case-study detail pages built from CASE_METADATA). */
  titleOverride?: string;
  /** Optional description override. */
  descriptionOverride?: string;
  /** Optional canonical override — full path including the locale prefix. */
  canonicalOverride?: string;
  /** Whether to instruct crawlers to index the page (default true). */
  index?: boolean;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: opts.locale, namespace: 'Seo' });

  const normalisedPath = opts.path === '/' ? '' : opts.path;
  const canonical =
    opts.canonicalOverride ?? `${env.SITE_URL}/${opts.locale}${normalisedPath}`;

  const title =
    opts.titleOverride ?? t(`${opts.page}.title` as `${typeof opts.page}.title`);
  const description =
    opts.descriptionOverride ??
    t(`${opts.page}.description` as `${typeof opts.page}.description`);

  // hreflang map: every locale → its full URL for this same logical page.
  // Also include `x-default` pointing at the default locale, so search engines
  // know which version to surface when the user's locale is unknown.
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = `${env.SITE_URL}/${loc}${normalisedPath}`;
  }
  languages['x-default'] = `${env.SITE_URL}/${routing.defaultLocale}${normalisedPath}`;

  const ogImage = `${env.SITE_URL}/og.png`;

  return {
    title,
    description,
    metadataBase: new URL(env.SITE_URL),
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      type: 'website',
      siteName: 'HELM Studio',
      locale: opts.locale,
      url: canonical,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'HELM Studio' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: opts.index === false ? { index: false, follow: true } : undefined,
  };
}
