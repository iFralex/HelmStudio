'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      router.push('/login');
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      Esci
    </Button>
  );
}
