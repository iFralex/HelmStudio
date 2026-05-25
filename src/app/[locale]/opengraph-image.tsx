import { ImageResponse } from 'next/og';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Per-locale Open Graph image, generated at request time by next/og (Satori).
 *
 * Auto-discovered by Next.js for every route under [locale]/ — no need to
 * reference it from metadata. Twitter cards reuse it via the parallel
 * file convention (or fall through to this one when twitter-image.tsx is
 * absent).
 *
 * Satori constraints to keep in mind when editing:
 *  - every container that holds multiple children needs `display: 'flex'`
 *  - only a subset of CSS is supported (no filters, no grid, limited svg)
 *  - fonts default to system; for the brand we accept the OS default sans
 *    rather than ship the Space Grotesk binary (~140 kb) in every render
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'HELM Studio';

export function generateImageMetadata() {
  return routing.locales.map((locale) => ({ id: locale, alt: 'HELM Studio' }));
}

const TAGLINES: Record<Locale, string> = {
  it: 'Automazioni AI su misura per creator.',
  en: 'Bespoke AI automations for creators.',
  de: 'Maßgeschneiderte KI-Automationen für Creator.',
  es: 'Automatizaciones IA a medida para creators.',
};

const BG = '#FBF8F1';
const FG = '#161616';
const ACCENT = '#FF8552';
const MUTED = '#6b6b6b';

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const tagline = TAGLINES[locale] ?? TAGLINES[routing.defaultLocale];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: BG,
          padding: '70px 80px',
          position: 'relative',
        }}
      >
        {/* Top row: logo + wordmark on the left, helmstudio.it on the right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {/* H mark with the same geometry as the site logo. Satori renders
                inline SVG — the orange highlight has no turbulence filter (not
                supported), but the wobble in the path still reads. */}
            <svg
              width="160"
              height="160"
              viewBox="0 0 120 120"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: 'visible' }}
            >
              <rect x="10" y="10" width="40" height="100" fill={FG} />
              <rect x="70" y="10" width="40" height="100" fill={FG} />
              <rect x="10" y="51" width="100" height="18" fill={FG} />
              <path
                d="M -4 42 C 28 38, 58 45, 96 40 C 116 38, 124 50, 124 60 C 124 70, 116 82, 96 80 C 58 75, 28 82, -4 78 C -10 70, -10 50, -4 42 Z"
                fill={ACCENT}
              />
            </svg>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 18,
                fontSize: 96,
                fontWeight: 800,
                color: FG,
                letterSpacing: -3,
              }}
            >
              <span>HELM</span>
              <span style={{ fontWeight: 500, opacity: 0.65 }}>Studio</span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: `2px solid ${FG}`,
              padding: '10px 18px',
              fontFamily: 'monospace',
              fontSize: 20,
              letterSpacing: 4,
              color: FG,
              textTransform: 'uppercase',
              transform: 'rotate(-2deg)',
            }}
          >
            Milano · 2026
          </div>
        </div>

        {/* Tagline anchored to the bottom-left, big enough to be readable in
            social previews even at thumbnail size */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 64,
              fontWeight: 700,
              color: FG,
              lineHeight: 1.1,
              letterSpacing: -1.5,
            }}
          >
            {tagline}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontFamily: 'monospace',
              fontSize: 22,
              color: MUTED,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ display: 'flex', width: 36, height: 4, backgroundColor: ACCENT }} />
            <span>helmstudio.it</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
