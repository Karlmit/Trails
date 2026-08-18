import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listTags, POST as createTag } from '@/app/api/v1/tags/route';
import { DELETE as deleteTag } from '@/app/api/v1/tags/[tagId]/route';
import { POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import { DELETE as deleteEntry } from '@/app/api/v1/timeline-entries/[entryId]/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function tagParams(tagId: string) {
  return { params: Promise.resolve({ tagId }) };
}

function entryParams(entryId: string) {
  return { params: Promise.resolve({ entryId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// FR-15/FR-16/FR-26, spec-tags-links-photos: Tag CRUD + cascade-delete.
// Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('tags route', () => {
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
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          subtype: 'MUSEUM',
          title: 'Museum visit',
          startAt: '2026-08-03T10:00:00.000Z',
          locationName: 'National Museum',
        },
        token,
      ),
    );
    entryId = (await entryRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('adds a Tag to an Entry (201) and it appears in the owner\'s list', async () => {
    const res = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'Family-friendly' }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.text).toBe('Family-friendly');

    const listRes = await listTags(
      jsonRequest(`http://localhost/api/v1/tags?ownerType=TIMELINE_ENTRY&ownerId=${entryId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((t: { id: string }) => t.id)).toContain(body.id);
  });

  it('rejects empty tag text (400) before any write', async () => {
    const res = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: '' }, token),
    );
    expect(res.status).toBe(400);
    expect(await testPrisma().tag.count()).toBe(0);
  });

  it('rejects an over-length tag text (400)', async () => {
    const res = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'a'.repeat(51) }, token),
    );
    expect(res.status).toBe(400);
  });

  it('404s when the owner does not exist', async () => {
    const res = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: UNKNOWN_ID, text: 'X' }, token),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated add (401)', async () => {
    const res = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'X' }),
    );
    expect(res.status).toBe(401);
  });

  it('deletes a Tag (204)', async () => {
    const created = await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'X' }, token),
    );
    const tagId = (await created.json()).id;

    const res = await deleteTag(jsonRequest(`http://localhost/api/v1/tags/${tagId}`, 'DELETE', undefined, token), tagParams(tagId));
    expect(res.status).toBe(204);
    expect(await testPrisma().tag.findUnique({ where: { id: tagId } })).toBeNull();
  });

  it('404s deleting an unknown Tag id', async () => {
    const res = await deleteTag(jsonRequest(`http://localhost/api/v1/tags/${UNKNOWN_ID}`, 'DELETE', undefined, token), tagParams(UNKNOWN_ID));
    expect(res.status).toBe(404);
  });

  it('cascades: deleting the owning Entry deletes its Tag rows too', async () => {
    await createTag(
      jsonRequest('http://localhost/api/v1/tags', 'POST', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, text: 'X' }, token),
    );
    expect(await testPrisma().tag.count({ where: { ownerId: entryId } })).toBe(1);

    const res = await deleteEntry(jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'DELETE', undefined, token), entryParams(entryId));
    expect(res.status).toBe(204);
    expect(await testPrisma().tag.count({ where: { ownerId: entryId } })).toBe(0);
  });
});
