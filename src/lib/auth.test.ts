import { createHmac } from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyPassword, createSessionCookie, verifySessionCookie } from './auth';

const VALID_SECRET = 'test-secret-that-is-at-least-32-chars!!';
const VALID_PASSWORD = 'correct-password';

function setEnv(password: string | undefined, secret: string | undefined) {
  if (password !== undefined) process.env.ADMIN_PASSWORD = password;
  else delete process.env.ADMIN_PASSWORD;
  if (secret !== undefined) process.env.SESSION_SECRET = secret;
  else delete process.env.SESSION_SECRET;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

describe('verifyPassword', () => {
  beforeEach(() => setEnv(VALID_PASSWORD, VALID_SECRET));
  afterEach(() => setEnv(undefined, undefined));

  it('returns true for the correct password', () => {
    expect(verifyPassword(VALID_PASSWORD)).toBe(true);
  });

  it('returns false for wrong password with same length', () => {
    expect(verifyPassword('wrong-password!!!!')).toBe(false);
  });

  it('returns false for password shorter than stored', () => {
    expect(verifyPassword('short')).toBe(false);
  });

  it('returns false for password longer than stored', () => {
    expect(verifyPassword(VALID_PASSWORD + 'extra')).toBe(false);
  });

  it('returns false when ADMIN_PASSWORD is not set', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyPassword(VALID_PASSWORD)).toBe(false);
  });
});

describe('createSessionCookie', () => {
  beforeEach(() => setEnv(VALID_PASSWORD, VALID_SECRET));
  afterEach(() => setEnv(undefined, undefined));

  it('returns a cookie with name, value, and future expiry', () => {
    const before = Date.now();
    const cookie = createSessionCookie();
    expect(cookie.name).toBe('session');
    expect(typeof cookie.value).toBe('string');
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(cookie.expires.getTime()).toBeGreaterThan(before);
  });

  it('throws when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;
    expect(() => createSessionCookie()).toThrow('SESSION_SECRET');
  });

  it('throws when SESSION_SECRET is too short', () => {
    process.env.SESSION_SECRET = 'short';
    expect(() => createSessionCookie()).toThrow('SESSION_SECRET');
  });
});

describe('verifySessionCookie', () => {
  beforeEach(() => setEnv(VALID_PASSWORD, VALID_SECRET));
  afterEach(() => setEnv(undefined, undefined));

  it('returns true for a freshly created cookie', () => {
    const { value } = createSessionCookie();
    expect(verifySessionCookie(value)).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(verifySessionCookie(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(verifySessionCookie('')).toBe(false);
  });

  it('returns false for a token with no dot separator', () => {
    expect(verifySessionCookie('nodot')).toBe(false);
  });

  it('returns false for a tampered signature', () => {
    const { value } = createSessionCookie();
    const dot = value.lastIndexOf('.');
    const tampered = value.slice(0, dot) + '.invalidsignature';
    expect(verifySessionCookie(tampered)).toBe(false);
  });

  it('returns false for a tampered payload with valid-looking signature', () => {
    const { value } = createSessionCookie();
    const dot = value.lastIndexOf('.');
    const sig = value.slice(dot + 1);
    const fakePayload = Buffer.from(JSON.stringify({ exp: Date.now() + 99999999 })).toString(
      'base64url',
    );
    expect(verifySessionCookie(`${fakePayload}.${sig}`)).toBe(false);
  });

  it('returns false for an expired token', () => {
    const expiredPayload = Buffer.from(JSON.stringify({ exp: Date.now() - 1 })).toString(
      'base64url',
    );
    const sig = signPayload(expiredPayload, VALID_SECRET);
    expect(verifySessionCookie(`${expiredPayload}.${sig}`)).toBe(false);
  });

  it('returns false when SESSION_SECRET is missing', () => {
    const { value } = createSessionCookie();
    delete process.env.SESSION_SECRET;
    expect(verifySessionCookie(value)).toBe(false);
  });
});
