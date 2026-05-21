import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';
import { NavLink } from '@/components/nav-link';
import { copy } from '@/lib/ui/copy';
import { quotaSummary } from '@/lib/youtube/dashboard';
import { formatCompact } from '@/lib/ui/format';

const navLinks = [
  { href: '/', label: copy.nav.dashboard },
  { href: '/channels', label: copy.nav.channels },
  { href: '/runs', label: copy.nav.runs },
  { href: '/settings', label: copy.nav.settings },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const quota = await quotaSummary();

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            {navLinks.map((link) => (
              <NavLink key={link.href} href={link.href}>
                {link.label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              title={copy.dashboard.quotaToday}
            >
              YT: {formatCompact(quota.spent)}/{formatCompact(quota.cap)}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
