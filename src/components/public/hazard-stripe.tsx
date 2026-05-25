import { cn } from '@/lib/utils';

export function HazardStripe({
  className,
  reverse = false,
  delay = 0,
}: {
  className?: string;
  reverse?: boolean;
  delay?: number;
}) {
  return (
    <div
      role="presentation"
      aria-hidden
      className={cn(
        'h-3 w-full overflow-hidden',
        'animate-hazard-slide opacity-0',
        className,
      )}
      style={{
        backgroundImage: reverse
          ? 'repeating-linear-gradient(-45deg, var(--brutal-fg) 0 14px, var(--brutal-accent) 14px 28px)'
          : 'repeating-linear-gradient(45deg, var(--brutal-fg) 0 14px, var(--brutal-accent) 14px 28px)',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}
