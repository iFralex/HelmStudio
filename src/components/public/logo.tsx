import { cn } from '@/lib/utils';

type LogoVariant = 'horizontal' | 'vertical' | 'mark';

/**
 * HELM Studio brand mark, inline SVG.
 *
 * The H is built from three rectangles in `currentColor` (so it inherits the
 * parent's text colour — works on cream and dark backgrounds without a prop).
 * An orange wobbly highlight is overlaid on the crossbar, drawn as a path
 * with the same hand-drawn marker-pen shape used by HighlightedHeading on the
 * homepage — so the brand DNA matches between the logo and the page typography.
 *
 * The mark sizes off the parent's font-size (h-[1.5em] / h-[2.4em]) so the
 * whole lockup scales by setting a single text-size on the parent.
 */
export function Logo({
  variant = 'horizontal',
  monochrome = false,
  className,
}: {
  variant?: LogoVariant;
  /** If true, drop the orange highlight and render the H in pure currentColor */
  monochrome?: boolean;
  className?: string;
}) {
  const mark = (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-full w-auto block shrink-0"
      // overflow allows the orange highlight to extend past the H pillars
      // on the left/right, mimicking a real marker overshoot
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Roughens the highlight's edges via turbulence-driven displacement
            so the stroke reads as ink on paper, not a clean vector pill.
            Stable ID is fine even with multiple Logo instances on the page:
            the definition is identical, so cross-references resolve. */}
        <filter id="helm-marker-rough" x="-15%" y="-30%" width="130%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" />
        </filter>
      </defs>

      {/* H pillars + structural crossbar — drawn in currentColor.
          Pillars widened (28→40) and crossbar thickened (8→16) for a
          confident brutalist weight; the H now reads as a stamp, not a
          skinny column. */}
      <rect x="10" y="10" width="40" height="100" fill="currentColor" />
      <rect x="70" y="10" width="40" height="100" fill="currentColor" />
      <rect x="10" y="51" width="100" height="18" fill="currentColor" />

      {/* Orange marker highlight — translucent (so the crossbar shows
          through like real highlighter ink) and roughened by the
          displacement filter. Asymmetric path adds the hand-drawn wobble;
          extends past the pillars on both sides for marker overshoot. */}
      {!monochrome && (
        <g filter="url(#helm-marker-rough)">
          <path
            d="M -4 42
               C 28 38, 58 45, 96 40
               C 116 38, 124 50, 124 60
               C 124 70, 116 82, 96 80
               C 58 75, 28 82, -4 78
               C -10 70, -10 50, -4 42 Z"
            fill="var(--brutal-accent, #FF8552)"
          />
          {/* Marker tail — small trailing stroke off the right edge,
              mimicking a pen lifted while still moving. */}
          <path
            d="M 118 62
               C 128 64, 134 70, 132 76
               C 130 78, 124 76, 120 72
               C 116 69, 114 65, 118 62 Z"
            fill="var(--brutal-accent, #FF8552)"
          />
        </g>
      )}
    </svg>
  );

  const wordmark = (
    <span className="font-display font-bold tracking-tight leading-none whitespace-nowrap">
      HELM <span className="font-medium opacity-75">Studio</span>
    </span>
  );

  if (variant === 'mark') {
    return (
      <span
        role="img"
        aria-label="HELM Studio"
        className={cn('inline-block aspect-square leading-none', className)}
      >
        {mark}
      </span>
    );
  }

  if (variant === 'vertical') {
    return (
      <span
        role="img"
        aria-label="HELM Studio"
        className={cn('inline-flex flex-col items-center gap-2 leading-none', className)}
      >
        <span className="h-[2.4em] aspect-square">{mark}</span>
        <span className="text-[1em]">{wordmark}</span>
      </span>
    );
  }

  // horizontal (default)
  return (
    <span
      role="img"
      aria-label="HELM Studio"
      className={cn('inline-flex items-center gap-2.5 leading-none', className)}
    >
      <span className="h-[1.5em] aspect-square">{mark}</span>
      {wordmark}
    </span>
  );
}
