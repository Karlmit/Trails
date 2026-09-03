import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { issueSession } from '@/lib/session';

// spec-push-notifications: the publish route's fan-out guard. The actual
// encryption/delivery is `web-push`'s job and needs a real Push Service, so
// the send itself is mocked out -- what is tested here is the part that can
// genuinely go wrong and would be visible to every subscriber if it did:
// each Blog Post notifies its audience exactly ONCE, ever, and unpublishing
// does not reset that.
const sendBlogPostNotification = vi.hoisted(() =>
  vi.fn(async () => ({ sent: 0, failed: 0, pruned: 0 })),
);

vi.mock('@/lib/push', () => ({ sendBlogPostNotification }));

const { PUT: publish, DELETE: unpublish } = await import(
  '@/app/api/v1/timeline-entries/[entryId]/publish/route'
);

function request(entryId: string, method: string, token: string) {
  return new NextRequest(`http://localhost/api/v1/timeline-entries/${entryId}/publish`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe.skipIf(!hasTestDatabase)('Blog Post publish -> notification fan-out', () => {
  let token: string;
  let tripId: string;
  let entryId: string;

  beforeEach(async () => {
    await resetDb();
    sendBlogPostNotification.mockClear();

    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    token = (await issueSession(user.id)).token;

    const trip = await testPrisma().trip.create({
      data: {
        name: 'Thailand',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-20T00:00:00.000Z'),
        timezone: 'Asia/Bangkok',
        visibility: 'PUBLIC',
      },
    });
    tripId = trip.id;

    const entry = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'Three days in Chiang Mai',
        startAt: new Date('2026-08-03T00:00:00.000Z'),
      },
    });
    entryId = entry.id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('notifies on the first publish and stamps notified_at', async () => {
    const res = await publish(request(entryId, 'PUT', token), {
      params: Promise.resolve({ entryId }),
    });
    expect(res.status).toBe(200);
    expect(sendBlogPostNotification).toHaveBeenCalledTimes(1);

    const [post, trip] = sendBlogPostNotification.mock.calls[0] as unknown as [
      { id: string; title: string },
      { name: string },
    ];
    expect(post.id).toBe(entryId);
    expect(post.title).toBe('Three days in Chiang Mai');
    expect(trip.name).toBe('Thailand');

    const row = await testPrisma().timelineEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.notifiedAt).not.toBeNull();
  });

  it('does not notify again when an already-published post is re-published', async () => {
    const params = { params: Promise.resolve({ entryId }) };
    await publish(request(entryId, 'PUT', token), params);
    await publish(request(entryId, 'PUT', token), { params: Promise.resolve({ entryId }) });

    expect(sendBlogPostNotification).toHaveBeenCalledTimes(1);
  });

  // Unpublish is a correction, not a reset -- re-publishing must not push
  // the same post to everyone a second time.
  it('does not notify again after unpublish + re-publish', async () => {
    await publish(request(entryId, 'PUT', token), { params: Promise.resolve({ entryId }) });
    await unpublish(request(entryId, 'DELETE', token), { params: Promise.resolve({ entryId }) });

    const afterUnpublish = await testPrisma().timelineEntry.findUniqueOrThrow({
      where: { id: entryId },
    });
    expect(afterUnpublish.publishedAt).toBeNull();
    expect(afterUnpublish.notifiedAt).not.toBeNull();

    await publish(request(entryId, 'PUT', token), { params: Promise.resolve({ entryId }) });
    expect(sendBlogPostNotification).toHaveBeenCalledTimes(1);
  });

  it('sends only once when two publishes race the same post', async () => {
    await Promise.all([
      publish(request(entryId, 'PUT', token), { params: Promise.resolve({ entryId }) }),
      publish(request(entryId, 'PUT', token), { params: Promise.resolve({ entryId }) }),
    ]);

    expect(sendBlogPostNotification).toHaveBeenCalledTimes(1);
  });

  it('never notifies for a non-Blog entry -- the route 404s it before any fan-out', async () => {
    const stay = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'STAY',
        title: 'Hotel',
        startAt: new Date('2026-08-04T00:00:00.000Z'),
        endAt: new Date('2026-08-06T00:00:00.000Z'),
      },
    });

    const res = await publish(request(stay.id, 'PUT', token), {
      params: Promise.resolve({ entryId: stay.id }),
    });
    expect(res.status).toBe(404);
    expect(sendBlogPostNotification).not.toHaveBeenCalled();
  });

  it('does not fail the publish when the fan-out itself throws', async () => {
    sendBlogPostNotification.mockRejectedValueOnce(new Error('push service unreachable'));

    const res = await publish(request(entryId, 'PUT', token), {
      params: Promise.resolve({ entryId }),
    });
    expect(res.status).toBe(200);
  });
});
