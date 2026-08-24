import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET, POST } from '@/app/api/v1/trips/route';
import { DELETE as deleteTrip, PATCH as patchTrip } from '@/app/api/v1/trips/[tripId]/route';
import { issueSession } from '@/lib/session';

function jsonRequest(method: string, body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/v1/trips', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function detailRequest(method: string, tripId: string, body?: unknown, token?: string) {
  return new NextRequest(`http://localhost/api/v1/trips/${tripId}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function tripParams(tripId: string) {
  return { params: Promise.resolve({ tripId }) };
}

// FR-1, FR-2: Trip creation computes Status server-side and rejects invalid
// input with a clean 400, no partial row created. Requires a live Postgres
// via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('trips route (create)', () => {
  let token: string;

  beforeEach(async () => {
    await resetDb();
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    token = (await issueSession(user.id)).token;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('creates a Trip and returns 201 with a computed Status', async () => {
    // Far-future dates so Status is deterministically UPCOMING regardless
    // of when this test happens to run.
    const res = await POST(
      jsonRequest(
        'POST',
        {
          name: 'Thailand',
          startDate: '2099-08-01',
          endDate: '2099-08-20',
          timezone: 'Asia/Bangkok',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('Thailand');
    expect(body.status).toBe('UPCOMING');
    expect(typeof body.id).toBe('string');

    const count = await testPrisma().trip.count();
    expect(count).toBe(1);
  });

  it('rejects a request missing a required field with a 400 and creates no row', async () => {
    const res = await POST(
      jsonRequest(
        'POST',
        {
          // name is missing
          startDate: '2099-08-01',
          endDate: '2099-08-20',
          timezone: 'Asia/Bangkok',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const count = await testPrisma().trip.count();
    expect(count).toBe(0);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await POST(
      jsonRequest('POST', {
        name: 'Thailand',
        startDate: '2099-08-01',
        endDate: '2099-08-20',
        timezone: 'Asia/Bangkok',
      }),
    );
    expect(res.status).toBe(401);

    const count = await testPrisma().trip.count();
    expect(count).toBe(0);
  });

  it('lists Trips ordered by start date', async () => {
    await POST(
      jsonRequest(
        'POST',
        { name: 'Later', startDate: '2026-09-01', endDate: '2026-09-05', timezone: 'UTC' },
        token,
      ),
    );
    await POST(
      jsonRequest(
        'POST',
        { name: 'Earlier', startDate: '2026-08-01', endDate: '2026-08-05', timezone: 'UTC' },
        token,
      ),
    );

    const res = await GET(jsonRequest('GET', undefined, token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((t: { name: string }) => t.name)).toEqual(['Earlier', 'Later']);
  });
});

// FR-1/FR-2: single-Trip update/delete, used by EditTripForm/DeleteTripButton.
// Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('trips route (detail: PATCH/DELETE)', () => {
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

  it('updates the submitted fields and leaves the rest untouched', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', tripId, { name: 'Thailand Trip' }, token),
      tripParams(tripId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Thailand Trip');
    expect(body.startDate).toBe('2026-08-01');
  });

  // User-requested: a manual override so a Trip reads as ACTIVE regardless
  // of its dates. This Trip's own dates (2026-08-01 to 2026-08-20) are in
  // the past relative to the real clock, so without the override its
  // Status would be COMPLETED -- confirming the override actually changes
  // computed Status, not just the stored flag.
  it('persists pinnedActive and makes Status read ACTIVE regardless of dates', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', tripId, { pinnedActive: true }, token),
      tripParams(tripId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pinnedActive).toBe(true);
    expect(body.status).toBe('ACTIVE');

    const stored = await testPrisma().trip.findUnique({ where: { id: tripId } });
    expect(stored?.pinnedActive).toBe(true);
  });

  // Item 3 regression: a one-field PATCH must still be checked against the
  // *other* field's existing stored value, not skip date-order validation
  // just because only one of startDate/endDate was submitted.
  it('rejects a startDate-only PATCH that would invert the stored endDate', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', tripId, { startDate: '2026-08-25' }, token),
      tripParams(tripId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const stillThere = await testPrisma().trip.findUnique({ where: { id: tripId } });
    expect(stillThere?.startDate.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('rejects an endDate-only PATCH that would invert the stored startDate', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', tripId, { endDate: '2026-07-01' }, token),
      tripParams(tripId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unauthenticated PATCH', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', tripId, { name: 'Nope' }),
      tripParams(tripId),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for a PATCH to an unknown Trip id', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', '11111111-1111-4111-8111-111111111111', { name: 'Nope' }, token),
      tripParams('11111111-1111-4111-8111-111111111111'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a PATCH with a malformed (non-UUID) Trip id', async () => {
    const res = await patchTrip(
      detailRequest('PATCH', 'not-a-uuid', { name: 'Nope' }, token),
      tripParams('not-a-uuid'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes a Trip', async () => {
    const res = await deleteTrip(detailRequest('DELETE', tripId, undefined, token), tripParams(tripId));
    expect(res.status).toBe(204);

    const remaining = await testPrisma().trip.count();
    expect(remaining).toBe(0);
  });

  it('rejects an unauthenticated DELETE', async () => {
    const res = await deleteTrip(detailRequest('DELETE', tripId), tripParams(tripId));
    expect(res.status).toBe(401);

    const remaining = await testPrisma().trip.count();
    expect(remaining).toBe(1);
  });

  it('returns 404 for a DELETE of an unknown Trip id', async () => {
    const res = await deleteTrip(
      detailRequest('DELETE', '11111111-1111-4111-8111-111111111111', undefined, token),
      tripParams('11111111-1111-4111-8111-111111111111'),
    );
    expect(res.status).toBe(404);
  });
});
