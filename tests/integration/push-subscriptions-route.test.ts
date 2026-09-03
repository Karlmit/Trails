import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { issueSession } from '@/lib/session';

// spec-push-notifications: POST/DELETE /api/v1/push/subscriptions -- the one
// route in this API that deliberately accepts an anonymous caller (see
// proxy.ts's second disclosed Guest-eligible exception), so "a Guest gets a
// row with user_id NULL" and "a signed-in User's row is linked" are both
// load-bearing behaviours rather than incidental.

const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/aaaaaaaaaaa';
const ENDPOINT_B = 'https://web.push.apple.com/bbbbbbbbbbb';

function subscribeBody(endpoint: string, overrides: Record<string, unknown> = {}) {
  return { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' }, ...overrides };
}

function jsonRequest(method: string, body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/v1/push/subscriptions', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasTestDatabase)('push subscriptions route', () => {
  // lib/push-config.ts reads the VAPID env vars once at module load, and
  // POST 503s without them -- so the env has to be in place BEFORE the
  // route module is first imported. ESM hoists static imports above
  // top-level assignments, hence the dynamic import here rather than an
  // import at the top of the file.
  let POST: typeof import('@/app/api/v1/push/subscriptions/route')['POST'];
  let DELETE: typeof import('@/app/api/v1/push/subscriptions/route')['DELETE'];

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY ||= 'test-public-key';
    process.env.VAPID_PRIVATE_KEY ||= 'test-private-key';
    const route = await import('@/app/api/v1/push/subscriptions/route');
    POST = route.POST;
    DELETE = route.DELETE;
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('stores an anonymous Guest subscription with user_id NULL', async () => {
    const res = await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A)));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ endpoint: ENDPOINT_A });

    const rows = await testPrisma().pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(rows[0].endpoint).toBe(ENDPOINT_A);
    expect(rows[0].p256dh).toBe('p256dh-key');
    // sv is the app-wide default when nothing else says otherwise.
    expect(rows[0].locale).toBe('sv');
  });

  it('links the subscription to the acting User when a session is present', async () => {
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN', locale: 'en' },
    });
    const { token } = await issueSession(user.id);

    const res = await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A), token));
    expect(res.status).toBe(201);

    const row = await testPrisma().pushSubscription.findUniqueOrThrow({
      where: { endpoint: ENDPOINT_A },
    });
    expect(row.userId).toBe(user.id);
    // A signed-in User's own stored preference wins over anything the
    // client sent (same priority order as lib/locale.ts's pickLocale).
    expect(row.locale).toBe('en');
  });

  it('honours an explicit locale for a Guest, who has no stored preference', async () => {
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A, { locale: 'en' })));

    const row = await testPrisma().pushSubscription.findUniqueOrThrow({
      where: { endpoint: ENDPOINT_A },
    });
    expect(row.locale).toBe('en');
  });

  // The endpoint is the natural key: a browser re-registers its Service
  // Worker constantly and hands back the same endpoint each time.
  it('upserts on endpoint instead of accumulating duplicate rows', async () => {
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A)));
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A)));
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_B)));

    expect(await testPrisma().pushSubscription.count()).toBe(2);
  });

  it('claims an existing Guest row for the User who later signs in on the same browser', async () => {
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A)));

    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    const { token } = await issueSession(user.id);
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A), token));

    const rows = await testPrisma().pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
  });

  it('rejects a non-https endpoint', async () => {
    const res = await POST(jsonRequest('POST', subscribeBody('http://insecure.example/x')));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma().pushSubscription.count()).toBe(0);
  });

  it('rejects a body missing the browser keys', async () => {
    const res = await POST(jsonRequest('POST', { endpoint: ENDPOINT_A }));
    expect(res.status).toBe(400);
  });

  it('ignores expirationTime, which the browser own toJSON() includes', async () => {
    const res = await POST(
      jsonRequest('POST', subscribeBody(ENDPOINT_A, { expirationTime: null })),
    );
    expect(res.status).toBe(201);
  });

  it('deletes by endpoint, and treats an unknown endpoint as an ordinary 204', async () => {
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A)));

    const res = await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT_A }));
    expect(res.status).toBe(204);
    expect(await testPrisma().pushSubscription.count()).toBe(0);

    // Unsubscribing twice is not an error.
    const again = await DELETE(jsonRequest('DELETE', { endpoint: ENDPOINT_A }));
    expect(again.status).toBe(204);
  });

  it('cascades a User deletion to their subscriptions', async () => {
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    const { token } = await issueSession(user.id);
    await POST(jsonRequest('POST', subscribeBody(ENDPOINT_A), token));

    await testPrisma().user.delete({ where: { id: user.id } });
    expect(await testPrisma().pushSubscription.count()).toBe(0);
  });
});
