'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('LanguageSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  function switchTo(target: string) {
    if (target === locale) return;
    // `params` strips the locale segment; next-intl's router re-applies it.
    router.replace(
      // @ts-expect-error -- pathname strings are validated by next-intl at runtime
      { pathname, params },
      { locale: target },
    );
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex border-2 border-brutal-fg font-mono text-xs uppercase tracking-[0.18em]',
        className,
      )}
    >
      {routing.locales.map((loc, i) => {
        const isActive = loc === locale;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchTo(loc)}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`${t('switchTo')} – ${loc === 'it' ? t('italian') : t('english')}`}
            className={cn(
              'px-2.5 py-1 transition-colors',
              i > 0 && 'border-l-2 border-brutal-fg',
              isActive
                ? 'bg-brutal-fg text-brutal-bg'
                : 'bg-brutal-bg text-brutal-fg hover:bg-brutal-fg/10',
            )}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
