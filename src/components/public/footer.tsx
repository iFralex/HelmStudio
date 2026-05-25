import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HazardStripe } from './hazard-stripe';

export async function Footer() {
  const t = await getTranslations('Footer');
  const year = new Date().getFullYear();

  return (
    <footer className="mt-32 border-t-2 border-brutal-fg bg-brutal-bg">
      <HazardStripe delay={800} />
      <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 py-10 grid gap-8 md:grid-cols-[1fr_auto] items-end">
        <div className="space-y-2">
          <p className="font-display text-lg font-bold leading-snug max-w-md">
            “{t('manifesto')}”
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brutal-muted">
            {t('company')} · {t('address')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs uppercase tracking-[0.18em]">
          <Link href="/privacy" className="hover:text-brutal-accent transition-colors">
            {t('privacy')}
          </Link>
          <span aria-hidden className="text-brutal-muted">·</span>
          <Link href="/cookie" className="hover:text-brutal-accent transition-colors">
            {t('cookies')}
          </Link>
          <span aria-hidden className="text-brutal-muted">·</span>
          <span className="text-brutal-muted">© {year}</span>
        </div>
      </div>
    </footer>
  );
}
