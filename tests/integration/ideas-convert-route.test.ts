import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { POST as createIdea } from '@/app/api/v1/ideas/route';
import { POST as convertIdea } from '@/app/api/v1/ideas/[ideaId]/convert/route';
import { POST as createTag } from '@/app/api/v1/tags/route';
import { POST as createLink } from '@/app/api/v1/links/route';
import { POST as uploadPhoto } from '@/app/api/v1/photos/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function ideaParams(ideaId: string) {
  return { params: Promise.resolve({ ideaId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// FR-17, spec-ideas: converting an Idea creates a TimelineEntry and deletes
// the Idea, atomically -- and a validation failure on the Entry side must
// leave the Idea untouched (Acceptance Criteria). Requires a live Postgres
// via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('ideas convert route', () => {
  let token: string;
  let tripId: string;
  let ideaId: string;

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

    const ideaRes = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        title: 'Cooking class',
        priority: 'MUST_DO',
        weatherSuitability: 'INDOOR',
        weatherTags: ['Rainy day'],
        estimatedExpenseAmount: 40,
        estimatedExpenseCurrency: 'USD',
      }, token),
    );
    ideaId = (await ideaRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  // Acceptance Criteria: converting an Idea with an estimated expense
  // carries it onto the new Entry's own Expense fields, and the Idea is
  // gone afterward.
  it('creates the Entry with title/expense carried over, deletes the Idea, and returns the new Entry', async () => {
    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        {
          entryType: 'ACTIVITY',
          title: 'Cooking class',
          subtype: 'TOUR',
          startAt: '2026-08-05T10:00:00.000Z',
          endAt: '2026-08-05T13:00:00.000Z',
          locationName: 'Cooking School',
          expenseAmount: 40,
          expenseCurrency: 'USD',
          bookingReference: 'BK-123',
        },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entryType).toBe('ACTIVITY');
    expect(body.title).toBe('Cooking class');
    expect(body.expenseAmount).toBe(40);
    expect(body.expenseCurrency).toBe('USD');
    expect(body.tripId).toBe(tripId);

    const remainingIdeas = await testPrisma().idea.count();
    expect(remainingIdeas).toBe(0);

    const entries = await testPrisma().timelineEntry.count();
    expect(entries).toBe(1);
  });

  // Acceptance Criteria: an Entry-side validation failure (missing required
  // date) must block the conversion and leave the Idea in place.
  it('blocks the conversion and keeps the Idea when the Entry body fails validation', async () => {
    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        {
          entryType: 'ACTIVITY',
          title: 'Cooking class',
          subtype: 'TOUR',
          // Missing `startAt` -- a required field for every Entry Type.
        },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const stillThere = await testPrisma().idea.findUnique({ where: { id: ideaId } });
    expect(stillThere).not.toBeNull();
    const entries = await testPrisma().timelineEntry.count();
    expect(entries).toBe(0);
  });

  it('blocks the conversion when the chosen Entry Type\'s own ordering rule fails (Stay check-out not later than check-in)', async () => {
    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        {
          entryType: 'STAY',
          title: 'Beach Resort',
          subtype: 'RESORT',
          startAt: '2026-08-05T14:00:00.000Z',
          endAt: '2026-08-05T14:00:00.000Z',
          locationName: 'Beach Resort',
        },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(400);

    const stillThere = await testPrisma().idea.findUnique({ where: { id: ideaId } });
    expect(stillThere).not.toBeNull();
  });

  it('ignores a caller-supplied tripId and always uses the Idea\'s own Trip', async () => {
    const otherTrip = await testPrisma().trip.create({
      data: {
        name: 'Other trip',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-10T00:00:00.000Z'),
        timezone: 'UTC',
      },
    });

    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        {
          tripId: otherTrip.id,
          entryType: 'NOTE',
          title: 'Cooking class',
          startAt: '2026-08-05T10:00:00.000Z',
        },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tripId).toBe(tripId);
  });

  // spec-blog: BLOG_POST joined CREATABLE_ENTRY_TYPES (it's creatable/
  // editable through the timeline-entries API now), but converting an Idea
  // into a Blog Post is explicitly out of this endpoint's scope -- see the
  // route's own comment.
  it('rejects entryType=BLOG_POST (400) -- Idea conversion never produces a Blog Post', async () => {
    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        { entryType: 'BLOG_POST', title: 'Cooking class', startAt: '2026-08-05T10:00:00.000Z' },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(400);

    const stillThere = await testPrisma().idea.findUnique({ where: { id: ideaId } });
    expect(stillThere).not.toBeNull();
  });

  it('404s for an unknown Idea id', async () => {
    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${UNKNOWN_ID}/convert`,
        'POST',
        { entryType: 'NOTE', title: 'X', startAt: '2026-08-05T10:00:00.000Z' },
        token,
      ),
      ideaParams(UNKNOWN_ID),
    );
    expect(res.status).toBe(404);
  });

  // AD-4's literal rule, spec-tags-links-photos: "reassigns (not
  // duplicates) its Tag/Link/Photo rows' ownerType/ownerId to the new
  // Entry." Acceptance Criteria: "all three appear unchanged on the new
  // Entry and the Idea itself is gone (not duplicated rows)."
  it('reassigns Tag/Link/Photo ownership to the new Entry, never duplicating them', async () => {
    const tagRes = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'IDEA', ownerId: ideaId, text: 'Foodie' }, token),
    );
    const tag = await tagRes.json();

    const linkRes = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IDEA', ownerId: ideaId, url: 'https://example.com/class' }, token),
    );
    const link = await linkRes.json();

    const formData = new FormData();
    formData.append('ownerType', 'IDEA');
    formData.append('ownerId', ideaId);
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'idea.png', { type: 'image/png' }));
    const photoRes = await uploadPhoto(
      new NextRequest('http://localhost/api/v1/photos', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    const photo = await photoRes.json();

    const res = await convertIdea(
      jsonRequest(
        `http://localhost/api/v1/ideas/${ideaId}/convert`,
        'POST',
        { entryType: 'ACTIVITY', title: 'Cooking class', subtype: 'TOUR', startAt: '2026-08-05T10:00:00.000Z', endAt: '2026-08-05T13:00:00.000Z', locationName: 'Cooking School' },
        token,
      ),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(201);
    const entry = await res.json();

    const storedTag = await testPrisma().tag.findUnique({ where: { id: tag.id } });
    expect(storedTag?.ownerType).toBe('TIMELINE_ENTRY');
    expect(storedTag?.ownerId).toBe(entry.id);

    const storedLink = await testPrisma().link.findUnique({ where: { id: link.id } });
    expect(storedLink?.ownerType).toBe('TIMELINE_ENTRY');
    expect(storedLink?.ownerId).toBe(entry.id);

    const storedPhoto = await testPrisma().photo.findUnique({ where: { id: photo.id } });
    expect(storedPhoto?.ownerType).toBe('TIMELINE_ENTRY');
    expect(storedPhoto?.ownerId).toBe(entry.id);

    // Never duplicated -- exactly one row each, still pointing at the same ids.
    expect(await testPrisma().tag.count()).toBe(1);
    expect(await testPrisma().link.count()).toBe(1);
    expect(await testPrisma().photo.count()).toBe(1);
  });

  it('rejects an unauthenticated convert (401)', async () => {
    const res = await convertIdea(
      jsonRequest(`http://localhost/api/v1/ideas/${ideaId}/convert`, 'POST', {
        entryType: 'NOTE',
        title: 'X',
        startAt: '2026-08-05T10:00:00.000Z',
      }),
      ideaParams(ideaId),
    );
    expect(res.status).toBe(401);

    const stillThere = await testPrisma().idea.findUnique({ where: { id: ideaId } });
    expect(stillThere).not.toBeNull();
  });
});
