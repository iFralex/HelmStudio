import { cn } from '@/lib/utils';

export function SectionBadge({
  number,
  label,
  className,
  style,
}: {
  number: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-stretch border-2 border-brutal-fg shadow-brutal-sm font-mono text-xs uppercase tracking-[0.18em]',
        className,
      )}
      style={style}
    >
      <span className="bg-brutal-fg text-brutal-bg px-3 py-1.5 font-semibold">
        {number}
      </span>
      <span className="px-3 py-1.5">{label}</span>
    </div>
  );
}
