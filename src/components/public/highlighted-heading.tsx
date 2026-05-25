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
    <h1 className={cn('font-display font-bold leading-[0.95] tracking-tight', className)}>
      {segments.map((segment, segIdx) => {
        const isAccent = segment.startsWith('[') && segment.endsWith(']');
        const content = isAccent ? segment.slice(1, -1) : segment;

        // Split into word chunks (preserving spaces between words)
        const chunks = content.split(/(\s+)/);

        return (
          <span
            key={segIdx}
            className={isAccent ? 'relative inline-block whitespace-nowrap' : ''}
          >
            {chunks.map((chunk, i) => {
              if (/^\s+$/.test(chunk)) return chunk;
              const delay = baseDelay + chunkIndex * stagger;
              chunkIndex += 1;
              return (
                <span
                  key={i}
                  className="inline-block animate-hero-word opacity-0"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  {chunk}
                </span>
              );
            })}
            {isAccent && (
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-[0.08em] -z-10 origin-left animate-highlight-draw scale-x-0 bg-brutal-accent"
                style={{
                  height: '0.42em',
                  animationDelay: `${baseDelay + chunkIndex * stagger + 80}ms`,
                }}
              />
            )}
          </span>
        );
      })}
    </h1>
  );
}
