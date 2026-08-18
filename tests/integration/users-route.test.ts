import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET, POST } from '@/app/api/v1/users/route';
import { issueSession } from '@/lib/session';

function jsonRequest(method: string, body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/v1/users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// FR-30, spec-admin-users: AD-7's `requireAdmin` route class, exercised
// against the I/O & Edge-Case Matrix. Requires a live Postgres via
// DATABASE_URL.
describe.skipIf(!hasTestDatabase)('users route (Admin-only create + list)', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    await resetDb();
    const admin = await testPrisma().user.create({
      data: { username: 'admin-sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    adminToken = (await issueSession(admin.id)).token;

    const plainUser = await testPrisma().user.create({
      data: { username: 'plain-mark', passwordHash: 'irrelevant', role: 'USER' },
    });
    userToken = (await issueSession(plainUser.id)).token;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('Admin creates a User: 201, role USER, no session issued for the new account', async () => {
    const res = await POST(
      jsonRequest('POST', { username: 'newbie', password: 'hunter2pass' }, adminToken),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.username).toBe('newbie');
    expect(body.role).toBe('USER');
    expect(body.passwordHash).toBeUndefined();

    const created = await testPrisma().user.findUnique({ where: { username: 'newbie' } });
    expect(created?.role).toBe('USER');

    // No session cookie set for the new account -- the Admin stays logged
    // in as themselves (spec's Intent).
    expect(res.cookies.get('trails_session')).toBeUndefined();

    const sessions = await testPrisma().session.findMany({ where: { userId: created!.id } });
    expect(sessions).toHaveLength(0);
  });

  it('non-Admin User attempting to create a User gets 403, not 201', async () => {
    const res = await POST(
      jsonRequest('POST', { username: 'newbie', password: 'hunter2pass' }, userToken),
    );
    expect(res.status).toBe(403);

    const created = await testPrisma().user.findUnique({ where: { username: 'newbie' } });
    expect(created).toBeNull();
  });

  it('unauthenticated request gets 401', async () => {
    const res = await POST(jsonRequest('POST', { username: 'newbie', password: 'hunter2pass' }));
    expect(res.status).toBe(401);
  });

  it('duplicate username gets a clean 409, not an unhandled DB error', async () => {
    await POST(jsonRequest('POST', { username: 'newbie', password: 'hunter2pass' }, adminToken));
    const res = await POST(
      jsonRequest('POST', { username: 'newbie', password: 'anotherpass1' }, adminToken),
    );
    expect(res.status).toBe(409);

    const count = await testPrisma().user.count({ where: { username: 'newbie' } });
    expect(count).toBe(1);
  });

  it('rejects a too-short username with the same validation shape as signup', async () => {
    const res = await POST(jsonRequest('POST', { username: 'ab', password: 'hunter2pass' }, adminToken));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a too-short password with the same validation shape as signup', async () => {
    const res = await POST(jsonRequest('POST', { username: 'newbie', password: 'short' }, adminToken));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('Admin views the Users list: username/role/createdAt only, never passwordHash', async () => {
    const res = await GET(jsonRequest('GET', undefined, adminToken));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((u: { username: string }) => u.username).sort()).toEqual([
      'admin-sara',
      'plain-mark',
    ]);
    for (const u of body) {
      expect(u.passwordHash).toBeUndefined();
      expect(typeof u.role).toBe('string');
      expect(typeof u.createdAt).toBe('string');
    }
  });

  it('non-Admin User listing Users gets 403', async () => {
    const res = await GET(jsonRequest('GET', undefined, userToken));
    expect(res.status).toBe(403);
  });

  it('unauthenticated list request gets 401', async () => {
    const res = await GET(jsonRequest('GET', undefined));
    expect(res.status).toBe(401);
  });
});
