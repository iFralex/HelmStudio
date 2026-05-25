import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * robots.txt for helmstudio.it.
 *
 * Allows everything public; explicitly blocks the admin/login surfaces so
 * crawlers don't waste budget on auth walls. The api/raw endpoint is also
 * blocked — it serves authenticated downloads, not public content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/login'],
      },
    ],
    sitemap: `${env.SITE_URL}/sitemap.xml`,
    host: env.SITE_URL,
  };
}
