import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { verifySessionCookie } from '@/lib/auth';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth-protected zones bypass i18n routing entirely. The outreach batch
  // consume endpoint is intentionally not session-protected because it is
  // hit by the downloaded .command bash script (no browser cookie); the
  // endpoint validates its own one-time token instead.
  const isProtectedApi =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth') &&
    pathname !== '/api/outreach/batch/consume';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin || isProtectedApi) {
    const token = request.cookies.get('session')?.value;
    if (!(await verifySessionCookie(token))) {
      if (isProtectedApi) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Public zones (login, api/auth, everything else) go through next-intl
  // to handle locale prefix routing and Accept-Language detection.
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Match everything except Next internals, static files, and image optimisation.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
