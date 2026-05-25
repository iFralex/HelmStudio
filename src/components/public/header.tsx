import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

export async function Header() {
  const t = await getTranslations('Nav');

  return (
    <header className="border-b-2 border-brutal-fg bg-brutal-bg">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-6 px-6 md:px-12 lg:px-20">
        <Link href="/" className="inline-flex items-center text-base">
          <Logo variant="horizontal" />
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-7 font-mono text-xs uppercase tracking-[0.18em]">
          <Link href="/come-funziona" className="relative hover:text-brutal-accent transition-colors">
            {t('howItWorks')}
          </Link>
          <Link href="/casi-studio" className="relative hover:text-brutal-accent transition-colors">
            {t('caseStudies')}
          </Link>
          <Link href="/chi-siamo" className="relative hover:text-brutal-accent transition-colors">
            {t('about')}
          </Link>
          <Link href="/contatti" className="relative hover:text-brutal-accent transition-colors">
            {t('contact')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
