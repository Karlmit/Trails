import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import { POST as convertEntry } from '@/app/api/v1/timeline-entries/[entryId]/convert-to-idea/route';
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

function entryParams(entryId: string) {
  return { params: Promise.resolve({ entryId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// The reverse of ideas-convert-route.test.ts: converting an ACTIVITY Entry
// creates an Idea and deletes the Entry, atomically. Requires a live
// Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('entries convert-to-idea route', () => {
  let token: string;
  let tripId: string;
  let entryId: string;

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

    const entryRes = await createEntry(
      jsonRequest('http://localhost/api/v1/timeline-entries', 'POST', {
        tripId,
        entryType: 'ACTIVITY',
        title: 'Cooking class',
        subtype: 'TOUR',
        startAt: '2026-08-05T10:00:00.000Z',
        endAt: '2026-08-05T13:00:00.000Z',
        locationName: 'Cooking School',
        expenseAmount: 40,
        expenseCurrency: 'USD',
      }, token),
    );
    entryId = (await entryRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  // Acceptance: converting an Activity Entry carries title/location/expense
  // onto the new Idea's own fields, and the Entry is gone afterward.
  it('creates the Idea with title/location/expense carried over, deletes the Entry, and returns the new Idea', async () => {
    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${entryId}/convert-to-idea`,
        'POST',
        {
          title: 'Cooking class',
          priority: 'MUST_DO',
          weatherSuitability: 'INDOOR',
          locationName: 'Cooking School',
          estimatedExpenseAmount: 40,
          estimatedExpenseCurrency: 'USD',
        },
        token,
      ),
      entryParams(entryId),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Cooking class');
    expect(body.priority).toBe('MUST_DO');
    expect(body.weatherSuitability).toBe('INDOOR');
    expect(body.estimatedExpenseAmount).toBe(40);
    expect(body.estimatedExpenseCurrency).toBe('USD');
    expect(body.tripId).toBe(tripId);

    const remainingEntries = await testPrisma().timelineEntry.count();
    expect(remainingEntries).toBe(0);

    const ideas = await testPrisma().idea.count();
    expect(ideas).toBe(1);
  });

  // Acceptance: an Idea-side validation failure (missing a required field)
  // must block the conversion and leave the Entry in place.
  it('blocks the conversion and keeps the Entry when the Idea body fails validation', async () => {
    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${entryId}/convert-to-idea`,
        'POST',
        {
          title: 'Cooking class',
          // Missing `priority`/`weatherSuitability` -- both required on Idea.
        },
        token,
      ),
      entryParams(entryId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const stillThere = await testPrisma().timelineEntry.findUnique({ where: { id: entryId } });
    expect(stillThere).not.toBeNull();
    const ideas = await testPrisma().idea.count();
    expect(ideas).toBe(0);
  });

  it('rejects converting a non-Activity Entry (400)', async () => {
    const stayRes = await createEntry(
      jsonRequest('http://localhost/api/v1/timeline-entries', 'POST', {
        tripId,
        entryType: 'STAY',
        title: 'Beach Resort',
        subtype: 'RESORT',
        startAt: '2026-08-05T14:00:00.000Z',
        endAt: '2026-08-06T10:00:00.000Z',
        locationName: 'Beach Resort',
      }, token),
    );
    const stayId = (await stayRes.json()).id;

    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${stayId}/convert-to-idea`,
        'POST',
        { title: 'Beach Resort', priority: 'MUST_DO', weatherSuitability: 'EITHER' },
        token,
      ),
      entryParams(stayId),
    );
    expect(res.status).toBe(400);

    const stillThere = await testPrisma().timelineEntry.findUnique({ where: { id: stayId } });
    expect(stillThere).not.toBeNull();
  });

  it('ignores a caller-supplied tripId and always uses the Entry\'s own Trip', async () => {
    const otherTrip = await testPrisma().trip.create({
      data: {
        name: 'Other trip',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-10T00:00:00.000Z'),
        timezone: 'UTC',
      },
    });

    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${entryId}/convert-to-idea`,
        'POST',
        {
          tripId: otherTrip.id,
          title: 'Cooking class',
          priority: 'MUST_DO',
          weatherSuitability: 'INDOOR',
        },
        token,
      ),
      entryParams(entryId),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tripId).toBe(tripId);
  });

  it('404s for an unknown Entry id', async () => {
    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${UNKNOWN_ID}/convert-to-idea`,
        'POST',
        { title: 'X', priority: 'MUST_DO', weatherSuitability: 'EITHER' },
        token,
      ),
      entryParams(UNKNOWN_ID),
    );
    expect(res.status).toBe(404);
  });

  // AD-4's reassignment rule, mirrored in reverse: Tag/Link/Photo rows move
  // onto the new Idea rather than being duplicated or dropped.
  it('reassigns Tag/Link/Photo ownership to the new Idea, never duplicating them', async () => {
    const tagRes = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'Foodie' }, token),
    );
    const tag = await tagRes.json();

    const linkRes = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, url: 'https://example.com/class' }, token),
    );
    const link = await linkRes.json();

    const formData = new FormData();
    formData.append('ownerType', 'TIMELINE_ENTRY');
    formData.append('ownerId', entryId);
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'entry.png', { type: 'image/png' }));
    const photoRes = await uploadPhoto(
      new NextRequest('http://localhost/api/v1/photos', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    const photo = await photoRes.json();

    const res = await convertEntry(
      jsonRequest(
        `http://localhost/api/v1/timeline-entries/${entryId}/convert-to-idea`,
        'POST',
        { title: 'Cooking class', priority: 'MUST_DO', weatherSuitability: 'INDOOR' },
        token,
      ),
      entryParams(entryId),
    );
    expect(res.status).toBe(201);
    const idea = await res.json();

    const storedTag = await testPrisma().tag.findUnique({ where: { id: tag.id } });
    expect(storedTag?.ownerType).toBe('IDEA');
    expect(storedTag?.ownerId).toBe(idea.id);

    const storedLink = await testPrisma().link.findUnique({ where: { id: link.id } });
    expect(storedLink?.ownerType).toBe('IDEA');
    expect(storedLink?.ownerId).toBe(idea.id);

    const storedPhoto = await testPrisma().photo.findUnique({ where: { id: photo.id } });
    expect(storedPhoto?.ownerType).toBe('IDEA');
    expect(storedPhoto?.ownerId).toBe(idea.id);

    expect(await testPrisma().tag.count()).toBe(1);
    expect(await testPrisma().link.count()).toBe(1);
    expect(await testPrisma().photo.count()).toBe(1);
  });

  it('rejects an unauthenticated convert (401)', async () => {
    const res = await convertEntry(
      jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}/convert-to-idea`, 'POST', {
        title: 'X',
        priority: 'MUST_DO',
        weatherSuitability: 'EITHER',
      }),
      entryParams(entryId),
    );
    expect(res.status).toBe(401);

    const stillThere = await testPrisma().timelineEntry.findUnique({ where: { id: entryId } });
    expect(stillThere).not.toBeNull();
  });
});
