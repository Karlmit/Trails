import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listEntries, POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import { DELETE as unpublish, PUT as publish } from '@/app/api/v1/timeline-entries/[entryId]/publish/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body?: unknown, token?: string) {
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function entryParams(entryId: string) {
  return { params: Promise.resolve({ entryId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// FR-19, AD-1, AD-10: the dedicated Publish/Unpublish action -- the one and
// only code path that ever writes `published_at`. Covers the spec's I/O
// matrix rows for "Publish a Draft", "Unpublish a Published post", and the
// mixed-content Timeline scenario. Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('timeline-entries publish route', () => {
  let token: string;
  let tripId: string;

  beforeEach(async () => {
    await resetDb();
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
      },
    });
    tripId = trip.id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('publishes a Draft (sets publishedAt), then it appears on the list', async () => {
    const created = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        { tripId, entryType: 'BLOG_POST', title: 'A journal entry', startAt: '2026-08-05T00:00:00.000Z' },
        token,
      ),
    );
    const postId = (await created.json()).id;

    const publishRes = await publish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${postId}/publish`, 'PUT', undefined, token),
      entryParams(postId),
    );
    expect(publishRes.status).toBe(200);
    const publishedBody = await publishRes.json();
    expect(publishedBody.publishedAt).not.toBeNull();

    const listRes = await listEntries(
      jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
    );
    const ids = (await listRes.json()).map((e: { id: string }) => e.id);
    expect(ids).toContain(postId);
  });

  it('unpublishes a Published post (clears publishedAt), then it disappears from the list again', async () => {
    const post = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'Already published',
        startAt: new Date('2026-08-05T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    const unpublishRes = await unpublish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${post.id}/publish`, 'DELETE', undefined, token),
      entryParams(post.id),
    );
    // 204, matching every other DELETE in this API (Section/Trip/Entry) --
    // no body to assert on.
    expect(unpublishRes.status).toBe(204);
    const stored = await testPrisma().timelineEntry.findUniqueOrThrow({ where: { id: post.id } });
    expect(stored.publishedAt).toBeNull();

    const listRes = await listEntries(
      jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
    );
    const ids = (await listRes.json()).map((e: { id: string }) => e.id);
    expect(ids).not.toContain(post.id);
  });

  // I/O matrix: "View Timeline, mixed content -- 1 Draft Blog Post, 1
  // Published Blog Post, 1 Activity, all different days -- Only the
  // Published Blog Post and the Activity render; the Draft renders nowhere."
  it('mixed content: only the Published Blog Post and the Activity show on the list, never the Draft', async () => {
    const draft = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'Draft post',
        startAt: new Date('2026-08-03T00:00:00.000Z'),
      },
    });
    const published = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'Published post',
        startAt: new Date('2026-08-05T00:00:00.000Z'),
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
    const activityRes = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Boat tour',
          subtype: 'TOUR',
          startAt: '2026-08-07T09:00:00.000Z',
          locationName: 'Marina Pier',
        },
        token,
      ),
    );
    const activityId = (await activityRes.json()).id;

    const listRes = await listEntries(
      jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
    );
    const ids = (await listRes.json()).map((e: { id: string }) => e.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).toContain(published.id);
    expect(ids).toContain(activityId);
  });

  it('404s publishing a non-existent entry', async () => {
    const res = await publish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${UNKNOWN_ID}/publish`, 'PUT', undefined, token),
      entryParams(UNKNOWN_ID),
    );
    expect(res.status).toBe(404);
  });

  it('404s publishing a non-Blog-Post entry (Publish only applies to Blog Post)', async () => {
    const activityRes = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Boat tour',
          subtype: 'TOUR',
          startAt: '2026-08-07T09:00:00.000Z',
          locationName: 'Marina Pier',
        },
        token,
      ),
    );
    const activityId = (await activityRes.json()).id;

    const res = await publish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${activityId}/publish`, 'PUT', undefined, token),
      entryParams(activityId),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated publish/unpublish (401)', async () => {
    const post = await testPrisma().timelineEntry.create({
      data: {
        tripId,
        entryType: 'BLOG_POST',
        title: 'A journal entry',
        startAt: new Date('2026-08-05T00:00:00.000Z'),
      },
    });

    const publishRes = await publish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${post.id}/publish`, 'PUT'),
      entryParams(post.id),
    );
    expect(publishRes.status).toBe(401);

    const unpublishRes = await unpublish(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${post.id}/publish`, 'DELETE'),
      entryParams(post.id),
    );
    expect(unpublishRes.status).toBe(401);
  });
});
