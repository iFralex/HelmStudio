import { cn } from '@/lib/utils';

/**
 * Renders a headline string that contains accent markers like:
 *    "Costruiamo automazioni [AI] [su misura] per ..."
 * Tokens wrapped in [square brackets] receive an orange marker-pen highlight
 * behind them. Plain segments are output as-is.
 *
 * Each chunk fades+slides in on page load with a small stagger. Highlight
 * strokes draw in after their word has appeared.
 */
export function HighlightedHeading({
  text,
  className,
  baseDelay = 200,
  stagger = 70,
}: {
  text: string;
  className?: string;
  baseDelay?: number;
  stagger?: number;
}) {
  const segments = text.split(/(\[[^\]]+\])/g).filter(Boolean);

  let chunkIndex = 0;

  return (
    <h1 className={cn('font-display font-bold tracking-tight', className)} style={{ lineHeight: 0.92 }}>
      {segments.map((segment, segIdx) => {
        const isAccent = segment.startsWith('[') && segment.endsWith(']');
        const content = isAccent ? segment.slice(1, -1) : segment;

        // Split into word chunks (preserving spaces between words)
        const chunks = content.split(/(\s+)/);

        return (
          <span
            key={segIdx}
            className={isAccent ? 'relative inline-block whitespace-nowrap isolate' : ''}
          >
            {chunks.map((chunk, i) => {
              if (/^\s+$/.test(chunk)) return chunk;
              const delay = baseDelay + chunkIndex * stagger;
              chunkIndex += 1;
              return (
                <span
                  key={i}
                  className="relative inline-block animate-hero-word opacity-0"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  {chunk}
                </span>
              );
            })}
            {isAccent && (
              <span
                aria-hidden
                className="absolute origin-left animate-highlight-draw pointer-events-none block"
                style={{
                  left: '-0.06em',
                  right: '-0.06em',
                  bottom: '0.02em',
                  height: '0.85em',
                  zIndex: -1,
                  animationDelay: `${baseDelay + chunkIndex * stagger + 80}ms`,
                  color: 'var(--brutal-accent)',
                }}
              >
                <svg
                  viewBox="0 0 200 100"
                  preserveAspectRatio="none"
                  width="100%"
                  height="100%"
                  className="block"
                >
                  {/* Sinuous highlighter blob — path spans full viewBox so stretching
                      feels consistent across words of any length. */}
                  <path
                    d="M 0 30
                       C 40 12, 100 8, 200 18
                       C 210 38, 208 62, 200 82
                       C 130 92, 60 96, 0 78
                       C -8 60, -6 48, 0 30 Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </h1>
  );
}
