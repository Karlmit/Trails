import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { POST as createSection } from '@/app/api/v1/sections/route';
import {
  DELETE as deleteSection,
  PATCH as patchSection,
} from '@/app/api/v1/sections/[sectionId]/route';
import { issueSession } from '@/lib/session';

function authedRequest(method: string, body: unknown, token: string) {
  return new NextRequest('http://localhost/api/v1/sections', {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function detailRequest(method: string, sectionId: string, body: unknown | undefined, token?: string) {
  return new NextRequest(`http://localhost/api/v1/sections/${sectionId}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function sectionParams(sectionId: string) {
  return { params: Promise.resolve({ sectionId }) };
}

// FR-5, AD-2: overlapping Sections rejected as a clean 400; touching
// endpoints allowed. Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('sections route (overlap rule)', () => {
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

  it('creates a Section', async () => {
    const res = await createSection(
      authedRequest('POST', { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07' }, token),
    );
    expect(res.status).toBe(201);
  });

  it('allows a second Section whose start touches the first one\'s end', async () => {
    await createSection(
      authedRequest('POST', { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07' }, token),
    );
    const res = await createSection(
      authedRequest('POST', { tripId, name: 'Krabi', startDate: '2026-08-07', endDate: '2026-08-10' }, token),
    );
    expect(res.status).toBe(201);
  });

  it('rejects a genuinely overlapping Section with a clean 400', async () => {
    await createSection(
      authedRequest('POST', { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07' }, token),
    );
    const res = await createSection(
      authedRequest('POST', { tripId, name: 'Bangkok', startDate: '2026-08-06', endDate: '2026-08-12' }, token),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a color value outside the curated palette (400)', async () => {
    const res = await createSection(
      authedRequest(
        'POST',
        { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07', color: '#ffffff' },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects an emoji value outside the curated set (400)', async () => {
    const res = await createSection(
      authedRequest(
        'POST',
        { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07', emoji: '🦄' },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('creates a Section with a curated color and emoji', async () => {
    const res = await createSection(
      authedRequest(
        'POST',
        { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07', color: '#c9633f', emoji: '🏖️' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.color).toBe('#c9633f');
    expect(body.emoji).toBe('🏖️');
  });

  it('rejects an unauthenticated request', async () => {
    const req = new NextRequest('http://localhost/api/v1/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, name: 'X', startDate: '2026-08-03', endDate: '2026-08-07' }),
    });
    const res = await createSection(req);
    expect(res.status).toBe(401);
  });
});

// FR-5, AD-2: single-Section update/delete, used by SectionManager's remove
// action -- plus the overlap rule applied to an *update*, not just create.
// Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('sections route (detail: PATCH/DELETE)', () => {
  let token: string;
  let tripId: string;
  let phuketId: string;
  let krabiId: string;

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
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        timezone: 'Asia/Bangkok',
      },
    });
    tripId = trip.id;

    const phuketRes = await createSection(
      authedRequest('POST', { tripId, name: 'Phuket', startDate: '2026-08-03', endDate: '2026-08-07' }, token),
    );
    phuketId = (await phuketRes.json()).id;

    const krabiRes = await createSection(
      authedRequest('POST', { tripId, name: 'Krabi', startDate: '2026-08-10', endDate: '2026-08-15' }, token),
    );
    krabiId = (await krabiRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('updates a Section\'s fields', async () => {
    const res = await patchSection(
      detailRequest('PATCH', phuketId, { name: 'Phuket (updated)' }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Phuket (updated)');
  });

  // Merge-before-validate for color/emoji: `null` (explicit clear) must be
  // distinguished from omitted (leave the stored value untouched) -- the
  // same bug class this codebase has hit before with other optional fields.
  it('a PATCH with color/emoji omitted leaves the stored values untouched', async () => {
    await patchSection(
      detailRequest('PATCH', phuketId, { color: '#c9633f', emoji: '🏖️' }, token),
      sectionParams(phuketId),
    );

    const res = await patchSection(
      detailRequest('PATCH', phuketId, { name: 'Phuket (renamed)' }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Phuket (renamed)');
    expect(body.color).toBe('#c9633f');
    expect(body.emoji).toBe('🏖️');
  });

  it('a PATCH with color/emoji explicitly null clears them back to the fallback', async () => {
    await patchSection(
      detailRequest('PATCH', phuketId, { color: '#c9633f', emoji: '🏖️' }, token),
      sectionParams(phuketId),
    );

    const res = await patchSection(
      detailRequest('PATCH', phuketId, { color: null, emoji: null }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.color).toBeNull();
    expect(body.emoji).toBeNull();
  });

  // Item 3 regression: a one-field PATCH must be checked against the
  // Section's other, already-stored date.
  it('rejects a startDate-only PATCH that would invert the stored endDate', async () => {
    const res = await patchSection(
      detailRequest('PATCH', phuketId, { startDate: '2026-08-09' }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(400);
  });

  // Items 6/7: the overlap rule enforced on create must also reject a
  // genuinely overlapping *update*, and be recognized as a clean 400 rather
  // than an unhandled 500.
  it('rejects an update that would make this Section overlap another one on the same Trip', async () => {
    const res = await patchSection(
      // Krabi is 2026-08-10..2026-08-15; stretching Phuket's end into it overlaps.
      detailRequest('PATCH', phuketId, { endDate: '2026-08-12' }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const unchanged = await testPrisma().section.findUnique({ where: { id: phuketId } });
    expect(unchanged?.endDate.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('allows an update whose new end date only touches the next Section\'s start', async () => {
    const res = await patchSection(
      detailRequest('PATCH', phuketId, { endDate: '2026-08-10' }, token),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated PATCH', async () => {
    const res = await patchSection(
      detailRequest('PATCH', phuketId, { name: 'Nope' }),
      sectionParams(phuketId),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for a PATCH to an unknown Section id', async () => {
    const res = await patchSection(
      detailRequest('PATCH', '11111111-1111-4111-8111-111111111111', { name: 'Nope' }, token),
      sectionParams('11111111-1111-4111-8111-111111111111'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes a Section', async () => {
    const res = await deleteSection(detailRequest('DELETE', phuketId, undefined, token), sectionParams(phuketId));
    expect(res.status).toBe(204);

    const remaining = await testPrisma().section.count();
    expect(remaining).toBe(1);
  });

  it('rejects an unauthenticated DELETE', async () => {
    const res = await deleteSection(detailRequest('DELETE', phuketId, undefined), sectionParams(phuketId));
    expect(res.status).toBe(401);

    const remaining = await testPrisma().section.count();
    expect(remaining).toBe(2);
  });

  it('returns 404 for a DELETE of an unknown Section id', async () => {
    const res = await deleteSection(
      detailRequest('DELETE', '11111111-1111-4111-8111-111111111111', undefined, token),
      sectionParams('11111111-1111-4111-8111-111111111111'),
    );
    expect(res.status).toBe(404);
  });
});
