import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listLinks, POST as createLink } from '@/app/api/v1/links/route';
import { DELETE as deleteLink } from '@/app/api/v1/links/[linkId]/route';
import { POST as createImportantInfo } from '@/app/api/v1/important-info/route';
import { DELETE as deleteImportantInfo } from '@/app/api/v1/important-info/[itemId]/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function linkParams(linkId: string) {
  return { params: Promise.resolve({ linkId }) };
}

function itemParams(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// FR-15/FR-16/FR-26, spec-tags-links-photos: Link CRUD + cascade-delete.
describe.skipIf(!hasTestDatabase)('links route', () => {
  let token: string;
  let tripId: string;
  let itemId: string;

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

    const itemRes = await createImportantInfo(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId, title: 'Visa info' }, token),
    );
    itemId = (await itemRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('adds a Link with a label (201) and it appears in the owner\'s list', async () => {
    const res = await createLink(
      jsonRequest(
        'http://localhost/api/v1/links',
        'POST',
        { ownerType: 'IMPORTANT_INFO', ownerId: itemId, url: 'https://example.com/visa', label: 'Visa portal' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toBe('https://example.com/visa');
    expect(body.label).toBe('Visa portal');

    const listRes = await listLinks(
      jsonRequest(`http://localhost/api/v1/links?ownerType=IMPORTANT_INFO&ownerId=${itemId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((l: { id: string }) => l.id)).toContain(body.id);
  });

  it('rejects a javascript: URI (400) before any write', async () => {
    const res = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IMPORTANT_INFO', ownerId: itemId, url: 'javascript:alert(1)' }, token),
    );
    expect(res.status).toBe(400);
    expect(await testPrisma().link.count()).toBe(0);
  });

  it('rejects a data: URI (400)', async () => {
    const res = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IMPORTANT_INFO', ownerId: itemId, url: 'data:text/html,x' }, token),
    );
    expect(res.status).toBe(400);
  });

  it('404s when the owner does not exist', async () => {
    const res = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IMPORTANT_INFO', ownerId: UNKNOWN_ID, url: 'https://example.com' }, token),
    );
    expect(res.status).toBe(404);
  });

  it('deletes a Link (204)', async () => {
    const created = await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IMPORTANT_INFO', ownerId: itemId, url: 'https://example.com' }, token),
    );
    const linkId = (await created.json()).id;

    const res = await deleteLink(jsonRequest(`http://localhost/api/v1/links/${linkId}`, 'DELETE', undefined, token), linkParams(linkId));
    expect(res.status).toBe(204);
    expect(await testPrisma().link.findUnique({ where: { id: linkId } })).toBeNull();
  });

  it('cascades: deleting the owning ImportantInfo item deletes its Link rows too', async () => {
    await createLink(
      jsonRequest('http://localhost/api/v1/links', 'POST', { ownerType: 'IMPORTANT_INFO', ownerId: itemId, url: 'https://example.com' }, token),
    );
    expect(await testPrisma().link.count({ where: { ownerId: itemId } })).toBe(1);

    const res = await deleteImportantInfo(
      jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'DELETE', undefined, token),
      itemParams(itemId),
    );
    expect(res.status).toBe(204);
    expect(await testPrisma().link.count({ where: { ownerId: itemId } })).toBe(0);
  });
});
