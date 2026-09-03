import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import type { PushPayload } from '@/lib/push';

// spec-push-notifications: the DB-backed fan-out. tests/push.test.ts pins
// the pure audience/payload decisions; this covers everything that only
// running the real `sendBlogPostNotification` against real rows exercises:
// which stored subscriptions are actually handed to the transport, that
// each one gets its OWN locale's payload, the TTL sent with it, and the
// row-level consequences of what the Push Service answers (a 410 prunes the
// subscription; a transient 500 must not).
//
// Only `web-push`'s network call is replaced -- `WebPushError` itself is the
// real class, since lib/push.ts's prune decision is an `instanceof` check on
// it, and a hand-rolled fake would let that logic pass while being wrong.
// (The encryption path around it is web-push's own responsibility, and
// cannot reach a local stand-in server anyway: it always speaks TLS,
// whatever scheme the endpoint carries.)
const sendNotification = vi.hoisted(() => vi.fn());

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  // lib/push.ts reaches the transport through the DEFAULT import
  // (`import webpush from 'web-push'`) but `WebPushError` through a named
  // one, so both shapes have to carry the override. `@types/web-push`
  // declares no `default` at all (it is synthesized by esModuleInterop),
  // hence building it from the named exports rather than spreading it.
  const mocked = { ...actual, sendNotification, setVapidDetails: vi.fn() };
  return { ...mocked, default: mocked };
});

const { WebPushError } = await import('web-push');

interface SentCall {
  endpoint: string;
  payload: PushPayload;
  ttl: number | undefined;
}

/** The calls the transport actually received, in a shape worth asserting on. */
function sentCalls(): SentCall[] {
  return sendNotification.mock.calls.map((call) => {
    const [subscription, body, options] = call as [
      { endpoint: string },
      string,
      { TTL?: number } | undefined,
    ];
    return { endpoint: subscription.endpoint, payload: JSON.parse(body), ttl: options?.TTL };
  });
}

const GUEST_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/guest-sv';
const USER_ENDPOINT = 'https://web.push.apple.com/user-en';

describe.skipIf(!hasTestDatabase)('sendBlogPostNotification (DB-backed fan-out)', () => {
  let sendBlogPostNotification: typeof import('@/lib/push')['sendBlogPostNotification'];

  let tripId: string;
  let postId: string;

  const publishedAt = new Date('2026-09-03T10:00:00.000Z');

  function post(overrides: Record<string, unknown> = {}) {
    return {
      id: postId,
      tripId,
      title: 'Three days in Chiang Mai',
      entryType: 'BLOG_POST' as const,
      isPrivate: false,
      publishedAt,
      ...overrides,
    };
  }

  function trip(overrides: Record<string, unknown> = {}) {
    return { id: tripId, name: 'Thailand', visibility: 'PUBLIC' as const, ...overrides };
  }

  beforeAll(async () => {
    // lib/push-config.ts reads the VAPID env once at module load, and an
    // unconfigured server sends nothing at all -- so the keypair has to be
    // in place before lib/push.ts is first imported. Hence the dynamic
    // import (ESM hoists static imports above top-level statements).
    process.env.VAPID_PUBLIC_KEY ||= 'test-public-key';
    process.env.VAPID_PRIVATE_KEY ||= 'test-private-key';
    ({ sendBlogPostNotification } = await import('@/lib/push'));
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });

    const created = await testPrisma().trip.create({
      data: {
        name: 'Thailand',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-20T00:00:00.000Z'),
        timezone: 'Asia/Bangkok',
        visibility: 'PUBLIC',
      },
    });
    tripId = created.id;

    const entry = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'Three days in Chiang Mai',
        startAt: new Date('2026-08-03T00:00:00.000Z'),
        publishedAt,
      },
    });
    postId = entry.id;

    // One anonymous Guest (Swedish) and one signed-in User (English).
    await testPrisma().pushSubscription.createMany({
      data: [
        { endpoint: GUEST_ENDPOINT, p256dh: 'p1', auth: 'a1', locale: 'sv' },
        { endpoint: USER_ENDPOINT, p256dh: 'p2', auth: 'a2', locale: 'en', userId: user.id },
      ],
    });
  });

  it('sends every eligible subscriber their own locale payload, deep-linked at the post', async () => {
    const result = await sendBlogPostNotification(post(), trip());

    expect(result).toEqual({ sent: 2, failed: 0, pruned: 0 });

    const calls = sentCalls();
    const guest = calls.find((call) => call.endpoint === GUEST_ENDPOINT);
    const user = calls.find((call) => call.endpoint === USER_ENDPOINT);

    expect(guest?.payload.title).toBe('Nytt blogginlägg');
    expect(user?.payload.title).toBe('New blog post');
    for (const call of calls) {
      expect(call.payload.url).toBe(`/trips/${tripId}/blog/${postId}`);
      expect(call.payload.body).toBe('Three days in Chiang Mai — Thailand');
      // Worth holding for a phone that is off right now, worthless a week
      // later -- 24h.
      expect(call.ttl).toBe(86400);
    }
  });

  it('skips the Guest subscription for a Private post on a Public Trip', async () => {
    const result = await sendBlogPostNotification(post({ isPrivate: true }), trip());

    expect(result.sent).toBe(1);
    expect(sentCalls().map((call) => call.endpoint)).toEqual([USER_ENDPOINT]);
  });

  it('skips the Guest subscription for a post on a PRIVATE Trip', async () => {
    const result = await sendBlogPostNotification(post(), trip({ visibility: 'PRIVATE' }));

    expect(result.sent).toBe(1);
    expect(sentCalls().map((call) => call.endpoint)).toEqual([USER_ENDPOINT]);
  });

  it('sends nothing at all for a Draft', async () => {
    const result = await sendBlogPostNotification(post({ publishedAt: null }), trip());

    expect(result).toEqual({ sent: 0, failed: 0, pruned: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  // 410 Gone / 404 = that browser is gone for good (uninstalled, site data
  // cleared, permission revoked); keeping the row makes every later publish
  // pay for a dead endpoint forever.
  it('prunes only the subscription the Push Service reports as Gone', async () => {
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint === GUEST_ENDPOINT) {
        throw new WebPushError('gone', 410, {}, '', GUEST_ENDPOINT);
      }
      return { statusCode: 201 };
    });

    const result = await sendBlogPostNotification(post(), trip());

    expect(result).toEqual({ sent: 1, failed: 1, pruned: 1 });
    const remaining = await testPrisma().pushSubscription.findMany();
    expect(remaining.map((row) => row.endpoint)).toEqual([USER_ENDPOINT]);
  });

  // A Push Service having a bad day must not cost the subscription.
  it('keeps a subscription after a transient 500', async () => {
    sendNotification.mockRejectedValue(
      new WebPushError('server error', 500, {}, '', GUEST_ENDPOINT),
    );

    const result = await sendBlogPostNotification(post(), trip());

    expect(result).toEqual({ sent: 0, failed: 2, pruned: 0 });
    expect(await testPrisma().pushSubscription.count()).toBe(2);
  });

  it('sends nothing when there are no subscriptions at all', async () => {
    await testPrisma().pushSubscription.deleteMany();

    const result = await sendBlogPostNotification(post(), trip());

    expect(result).toEqual({ sent: 0, failed: 0, pruned: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
