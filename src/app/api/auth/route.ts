import { NextResponse } from 'next/server';
import { verifyPassword, createSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const password =
    body !== null && typeof body === 'object' && 'password' in body
      ? String((body as Record<string, unknown>).password)
      : '';

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookie = await createSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: cookie.expires,
    path: '/',
  });
  return response;
}
