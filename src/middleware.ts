import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedApi =
    pathname.startsWith('/api/') && !pathname.startsWith('/api/auth');
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (!isAdmin && !isProtectedApi) return NextResponse.next();

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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
