import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getUserFromApiRequest } from '@/lib/auth';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { issueSession, revokeSession, validateSession } from '@/lib/session';

// AD-6: one session table, one shared invalidation path. Requires a live
// Postgres via DATABASE_URL (see docker-compose.yml / README-less setup);
// skipped otherwise so `npm test` still runs without Docker.
describe.skipIf(!hasTestDatabase)('session lifecycle (AD-6)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  async function makeUser() {
    return testPrisma().user.create({
      data: { username: `user-${Date.now()}`, passwordHash: 'irrelevant', role: 'USER' },
    });
  }

  it('issues a session that validates to the owning user', async () => {
    const user = await makeUser();
    const { token } = await issueSession(user.id);

    const result = await validateSession(token);
    expect(result?.user.id).toBe(user.id);
  });

  it('rejects an unknown token', async () => {
    const result = await validateSession('not-a-real-token');
    expect(result).toBeNull();
  });

  it('rejects a revoked token', async () => {
    const user = await makeUser();
    const { token } = await issueSession(user.id);

    await revokeSession(token);

    expect(await validateSession(token)).toBeNull();
  });

  it('revoking an unknown token is a no-op, not an error', async () => {
    await expect(revokeSession('never-issued')).resolves.toBeUndefined();
  });

  it('rejects an expired session', async () => {
    const user = await makeUser();
    const { token } = await issueSession(user.id);

    // Force expiry directly -- issueSession always sets a future expiry.
    await testPrisma().session.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await validateSession(token)).toBeNull();
  });

  it('renews an active bearer session once per day and keeps it revocable', async () => {
    const user = await makeUser();
    const { token } = await issueSession(user.id);
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await testPrisma().session.update({ where: { token }, data: { expiresAt: twoDaysFromNow } });

    const bearer = new NextRequest('http://localhost/api/v1/trips', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await getUserFromApiRequest(bearer))?.id).toBe(user.id);
    const renewed = (await validateSession(token))?.session.expiresAt;
    expect(renewed?.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    await getUserFromApiRequest(bearer);
    expect((await validateSession(token))?.session.expiresAt).toEqual(renewed);

    await revokeSession(token);
    expect(await getUserFromApiRequest(bearer)).toBeNull();
  });

  it('keeps cookie-only sessions on their original expiry schedule', async () => {
    const user = await makeUser();
    const { token } = await issueSession(user.id);
    const expiresAt = new Date(Date.now() + 60_000);
    await testPrisma().session.update({ where: { token }, data: { expiresAt } });
    const browser = new NextRequest('http://localhost/api/v1/trips', {
      headers: { cookie: `trails_session=${token}` },
    });
    expect((await getUserFromApiRequest(browser))?.id).toBe(user.id);
    expect((await validateSession(token))?.session.expiresAt).toEqual(expiresAt);
  });
});
