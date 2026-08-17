import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { proxy } from '@/proxy';
import { issueSession } from '@/lib/session';

function requestFor(pathname: string, options: { cookie?: string } = {}) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: options.cookie ? { cookie: options.cookie } : undefined,
  });
}

// AD-6/AD-7: proxy.ts (renamed from middleware.ts, see spec Design Notes) is
// the sole page/API auth gate -- exercised directly here with constructed
// NextRequests, not just indirectly through whatever page/route happens to
// sit behind it. Requires a live Postgres via DATABASE_URL, since
// validateSession and the zero-Users bootstrap check both query it.
describe.skipIf(!hasTestDatabase)('proxy (AD-6/AD-7 auth gate)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('redirects an unauthenticated request for a protected page to /login once a User exists', async () => {
    await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });

    const res = await proxy(requestFor('/trips'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('redirects an unauthenticated request for a protected page to /signup on a zero-User instance', async () => {
    const res = await proxy(requestFor('/trips'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/signup');
  });

  it('returns a 401 JSON error envelope for an unauthenticated protected API path', async () => {
    const res = await proxy(requestFor('/api/v1/trips'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it.each(['/login', '/signup', '/api/v1/auth'])(
    'passes through the public path %s without requiring a session',
    async (pathname) => {
      const res = await proxy(requestFor(pathname));
      expect(res.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('passes through a protected page for a request carrying a valid session cookie', async () => {
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    const { token } = await issueSession(user.id);

    const res = await proxy(requestFor('/trips', { cookie: `trails_session=${token}` }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
