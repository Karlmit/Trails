import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listIdeas, POST as createIdea } from '@/app/api/v1/ideas/route';
import { DELETE as deleteIdea, PATCH as patchIdea } from '@/app/api/v1/ideas/[ideaId]/route';
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

// FR-16, spec-ideas: Idea CRUD + filtering -- covers the spec's I/O matrix.
// Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('ideas route', () => {
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

  it('creates an Idea with a valid title (201, appears in the list)', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        title: 'Cooking class',
        priority: 'MUST_DO',
        weatherSuitability: 'INDOOR',
        weatherTags: ['Rainy day'],
      }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Cooking class');
    expect(body.weatherTags).toEqual(['Rainy day']);

    const listRes = await listIdeas(
      jsonRequest(`http://localhost/api/v1/ideas?tripId=${tripId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((i: { id: string }) => i.id)).toContain(body.id);
  });

  it('persists Location fields on create and PATCH (AD-11)', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        title: 'Blue Elephant',
        priority: 'MUST_DO',
        weatherSuitability: 'EITHER',
        locationName: 'Blue Elephant',
        locationAddress: '233 South Sathorn Rd, Bangkok',
        locationMapLink: 'https://maps.google.com/?q=blue+elephant',
      }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.locationName).toBe('Blue Elephant');
    expect(body.locationAddress).toBe('233 South Sathorn Rd, Bangkok');
    expect(body.locationMapLink).toBe('https://maps.google.com/?q=blue+elephant');

    const patchRes = await patchIdea(
      jsonRequest(`http://localhost/api/v1/ideas/${body.id}`, 'PATCH', {
        locationName: 'Blue Elephant (relocated)',
      }, token),
      { params: Promise.resolve({ ideaId: body.id }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.locationName).toBe('Blue Elephant (relocated)');
    // Untouched fields survive the partial update.
    expect(patched.locationAddress).toBe('233 South Sathorn Rd, Bangkok');
  });

  it('rejects a missing title (400)', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        priority: 'MAYBE',
        weatherSuitability: 'EITHER',
      }, token),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an estimated expense amount without a currency (400)', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        title: 'Beach club',
        priority: 'WOULD_LIKE',
        weatherSuitability: 'OUTDOOR',
        estimatedExpenseAmount: 50,
      }, token),
    );
    expect(res.status).toBe(400);
  });

  it('404s when the parent Trip does not exist', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId: UNKNOWN_ID,
        title: 'Orphan idea',
        priority: 'MAYBE',
        weatherSuitability: 'EITHER',
      }, token),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated create (401)', async () => {
    const res = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', {
        tripId,
        title: 'Orphan idea',
        priority: 'MAYBE',
        weatherSuitability: 'EITHER',
      }),
    );
    expect(res.status).toBe(401);
  });

  describe('filtering (GET)', () => {
    beforeEach(async () => {
      await createIdea(
        jsonRequest('http://localhost/api/v1/ideas', 'POST', {
          tripId,
          title: 'Cooking class',
          priority: 'MUST_DO',
          weatherSuitability: 'INDOOR',
          weatherTags: ['Rainy day'],
        }, token),
      );
      await createIdea(
        jsonRequest('http://localhost/api/v1/ideas', 'POST', {
          tripId,
          title: 'Beach club',
          priority: 'WOULD_LIKE',
          weatherSuitability: 'OUTDOOR',
          weatherTags: ['Sunny weather'],
        }, token),
      );
    });

    it('filters to only the matching Idea by weather tag', async () => {
      const res = await listIdeas(
        jsonRequest(`http://localhost/api/v1/ideas?tripId=${tripId}&weatherTag=Rainy%20day`, 'GET', undefined, token),
      );
      const body = await res.json();
      expect(body.map((i: { title: string }) => i.title)).toEqual(['Cooking class']);
    });

    it('returns an empty list (not an error) when no Idea matches the tag', async () => {
      const res = await listIdeas(
        jsonRequest(`http://localhost/api/v1/ideas?tripId=${tripId}&weatherTag=Snowy`, 'GET', undefined, token),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe('detail: PATCH/DELETE', () => {
    let ideaId: string;

    beforeEach(async () => {
      const res = await createIdea(
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
      ideaId = (await res.json()).id;
    });

    it('updates a field via PATCH', async () => {
      const res = await patchIdea(
        jsonRequest(`http://localhost/api/v1/ideas/${ideaId}`, 'PATCH', { title: 'Thai cooking class' }, token),
        ideaParams(ideaId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Thai cooking class');
    });

    it('rejects an amount-only PATCH that would strip the stored currency pairing (400)', async () => {
      // Only clearing the amount, leaving currency stored, would break the
      // "both or neither" invariant -- merge-before-check must catch this.
      const res = await patchIdea(
        jsonRequest(`http://localhost/api/v1/ideas/${ideaId}`, 'PATCH', { estimatedExpenseAmount: null }, token),
        ideaParams(ideaId),
      );
      expect(res.status).toBe(400);
    });

    it('deletes an Idea (204, not converted, no Entry created)', async () => {
      const res = await deleteIdea(
        jsonRequest(`http://localhost/api/v1/ideas/${ideaId}`, 'DELETE', undefined, token),
        ideaParams(ideaId),
      );
      expect(res.status).toBe(204);

      const remaining = await testPrisma().idea.count();
      expect(remaining).toBe(0);
      const entries = await testPrisma().timelineEntry.count();
      expect(entries).toBe(0);
    });

    it('returns 404 for an unknown/malformed id', async () => {
      const res = await deleteIdea(
        jsonRequest('http://localhost/api/v1/ideas/not-a-uuid', 'DELETE', undefined, token),
        ideaParams('not-a-uuid'),
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated PATCH/DELETE', async () => {
      const patchRes = await patchIdea(
        jsonRequest(`http://localhost/api/v1/ideas/${ideaId}`, 'PATCH', { title: 'Nope' }),
        ideaParams(ideaId),
      );
      expect(patchRes.status).toBe(401);

      const deleteRes = await deleteIdea(
        jsonRequest(`http://localhost/api/v1/ideas/${ideaId}`, 'DELETE', undefined),
        ideaParams(ideaId),
      );
      expect(deleteRes.status).toBe(401);
    });
  });
});
