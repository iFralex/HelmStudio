import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { routing } from '@/i18n/routing';
import { CASE_STUDY_SLUGS } from '@/components/public/case-data';

/**
 * Public sitemap for helmstudio.it.
 *
 * Emits one entry per (locale × public route) pair. Each entry declares
 * hreflang `alternates.languages` covering every other locale, so Google can
 * group the localized versions instead of treating them as duplicates.
 *
 * Admin / API / login routes are intentionally absent (they're also blocked
 * in robots.ts).
 *
 * `changeFrequency` and `priority` are hints — Google largely ignores them
 * but Bing and other crawlers still respect them.
 */

type PublicRoute = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
};

const STATIC_ROUTES: PublicRoute[] = [
  { path: '', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/come-funziona', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/casi-studio', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/chi-siamo', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/contatti', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/cookie', changeFrequency: 'yearly', priority: 0.2 },
];

const CASE_ROUTES: PublicRoute[] = CASE_STUDY_SLUGS.map((slug) => ({
  path: `/casi-studio/${slug}`,
  changeFrequency: 'monthly',
  priority: 0.6,
}));

function buildLanguageMap(path: string): Record<string, string> {
  const langs: Record<string, string> = {};
  for (const loc of routing.locales) {
    langs[loc] = `${env.SITE_URL}/${loc}${path}`;
  }
  // x-default tells search engines which version to surface when the user's
  // locale isn't one of ours.
  langs['x-default'] = `${env.SITE_URL}/${routing.defaultLocale}${path}`;
  return langs;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const allRoutes = [...STATIC_ROUTES, ...CASE_ROUTES];
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  for (const route of allRoutes) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${env.SITE_URL}/${locale}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: { languages: buildLanguageMap(route.path) },
      });
    }
  }

  return entries;
}
