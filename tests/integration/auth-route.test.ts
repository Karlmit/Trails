import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { DELETE, POST, PUT } from '@/app/api/v1/auth/route';

function jsonRequest(method: string, body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/v1/auth', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// FR-29/FR-30, AD-6, AD-7: bootstrap + login/logout on one Route Handler
// file. Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('auth route (bootstrap + login/logout)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('signup on a zero-User instance creates an Admin and issues a session', async () => {
    const res = await PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.user.role).toBe('ADMIN');
    expect(typeof body.token).toBe('string');
    expect(res.cookies.get('trails_session')?.value).toBe(body.token);
  });

  // Item 2 regression: the count-then-create signup bootstrap must be
  // atomic under concurrency, not just sequentially correct. Two requests
  // racing the zero-User window must not both succeed as ADMIN.
  it('under concurrent signup requests, exactly one succeeds and the other sees signup closed', async () => {
    const [first, second] = await Promise.all([
      PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' })),
      PUT(jsonRequest('PUT', { username: 'mark', password: 'anotherpass1' })),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 410]);

    const users = await testPrisma().user.count();
    expect(users).toBe(1);
  });

  it('closes signup permanently once an account exists (410)', async () => {
    await PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' }));

    const second = await PUT(jsonRequest('PUT', { username: 'mark', password: 'anotherpass1' }));
    expect(second.status).toBe(410);

    const users = await testPrisma().user.count();
    expect(users).toBe(1);
  });

  it('logs in with valid credentials', async () => {
    await PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' }));

    const res = await POST(jsonRequest('POST', { username: 'sara', password: 'hunter2pass' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('sara');
  });

  it('rejects wrong credentials with a generic 401', async () => {
    await PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' }));

    const res = await POST(jsonRequest('POST', { username: 'sara', password: 'wrongpassword' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown username with the same generic 401', async () => {
    const res = await POST(jsonRequest('POST', { username: 'nobody', password: 'whatever123' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logout revokes the session so it no longer validates', async () => {
    const signupRes = await PUT(jsonRequest('PUT', { username: 'sara', password: 'hunter2pass' }));
    const { token } = await signupRes.json();

    const logoutRes = await DELETE(
      new NextRequest('http://localhost/api/v1/auth', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(logoutRes.status).toBe(204);

    const session = await testPrisma().session.findUnique({ where: { token } });
    expect(session?.revokedAt).not.toBeNull();
  });
});
