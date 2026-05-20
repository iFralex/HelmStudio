import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/channels', label: 'Canali' },
  { href: '/runs', label: 'Run' },
  { href: '/settings', label: 'Impostazioni' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <LogoutButton />
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
