import Image from 'next/image';

const SIZE_CLASSES = {
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-24 h-24 md:w-32 md:h-32',
} as const;

const FONT_CLASSES = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-2xl md:text-3xl',
} as const;

const IMAGE_PX = {
  sm: 48,
  md: 80,
  lg: 128,
} as const;

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ChannelAvatar({
  channelName,
  logoUrl,
  size = 'md',
}: {
  channelName: string;
  logoUrl: string | null;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const dimension = SIZE_CLASSES[size];

  if (logoUrl) {
    const px = IMAGE_PX[size];
    return (
      <div className={`${dimension} border-2 border-brutal-fg overflow-hidden shrink-0 bg-brutal-bg`}>
        <Image
          src={logoUrl}
          alt={`${channelName} channel avatar`}
          width={px}
          height={px}
          className="h-full w-full object-cover"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={
        `${dimension} ${FONT_CLASSES[size]} border-2 border-brutal-fg bg-brutal-fg text-brutal-bg ` +
        'flex items-center justify-center font-display font-bold shrink-0 tabular-nums tracking-tight'
      }
    >
      {initialsFor(channelName)}
    </div>
  );
}
