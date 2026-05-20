import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is required');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function verifyPassword(plain: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  try {
    const a = Buffer.from(plain);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createSessionCookie(): { name: string; value: string; expires: Date } {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  const payload = Buffer.from(JSON.stringify({ exp: expires.getTime() })).toString('base64url');
  const sig = sign(payload);
  const value = `${payload}.${sig}`;
  return { name: COOKIE_NAME, value, expires };
}

export function verifySessionCookie(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expectedSig = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      exp: number;
    };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}
