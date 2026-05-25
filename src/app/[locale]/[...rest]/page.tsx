import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing, type Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = hasLocale(routing.locales, locale)
    ? (locale as Locale)
    : routing.defaultLocale;
  // 404s must not be indexed; the meta gets attached to the response that
  // CatchAllNotFound returns before notFound() takes over the body.
  return buildPageMetadata({
    locale: safeLocale,
    page: 'notFound',
    path: '/',
    index: false,
  });
}

/**
 * Catch-all for any URL inside a locale segment that doesn't match a defined
 * route. We invoke notFound() from a Server Component INSIDE the locale layout
 * tree so:
 *   1. The [locale]/layout.tsx runs first → setRequestLocale fires
 *   2. notFound() then triggers [locale]/not-found.tsx
 *   3. getTranslations() in not-found.tsx works because the locale context exists
 *
 * Without this, Next.js bubbles the unmatched route up past the layout and
 * renders the framework's default 404 instead of our brutalist one.
 */
export default async function CatchAllNotFound({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  notFound();
}
