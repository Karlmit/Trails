import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listItems, POST as createItem } from '@/app/api/v1/important-info/route';
import { DELETE as deleteItem, PATCH as patchItem } from '@/app/api/v1/important-info/[itemId]/route';
import { POST as uploadAttachment } from '@/app/api/v1/attachments/route';
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

function uploadRequest(
  url: string,
  fields: { ownerType?: string; ownerId?: string; file?: File },
  token?: string,
) {
  const formData = new FormData();
  if (fields.ownerType !== undefined) formData.append('ownerType', fields.ownerType);
  if (fields.ownerId !== undefined) formData.append('ownerId', fields.ownerId);
  if (fields.file !== undefined) formData.append('file', fields.file);

  return new NextRequest(url, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

function itemParams(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

function pdfFile(name = 'insurance.pdf'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'application/pdf' });
}

// FR-26, spec-important-info: ImportantInfo CRUD + Attachment cascade,
// mirroring app/api/v1/checklists' Route Handler test conventions -- covers
// the spec's frozen I/O matrix. Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('important-info route', () => {
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

  it('creates an item with a valid title (201, appears on the list)', async () => {
    const res = await createItem(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId, title: 'Travel Insurance' }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Travel Insurance');
    expect(body.isPrivate).toBe(false);

    const listRes = await listItems(
      jsonRequest(`http://localhost/api/v1/important-info?tripId=${tripId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((i: { id: string }) => i.id)).toContain(body.id);
  });

  it('creates an item with Contact Information and Location', async () => {
    const res = await createItem(
      jsonRequest(
        'http://localhost/api/v1/important-info',
        'POST',
        {
          tripId,
          title: 'Embassy',
          content: 'In case of emergency',
          locationName: 'US Embassy Bangkok',
          locationAddress: '95 Wireless Road',
          locationMapLink: 'https://maps.google.com/?q=embassy',
          contactName: 'Consular Section',
          contactPhone: '+66-2-205-4000',
          contactEmail: 'acsbkk@state.gov',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.locationName).toBe('US Embassy Bangkok');
    expect(body.locationMapLink).toBe('https://maps.google.com/?q=embassy');
    expect(body.contactEmail).toBe('acsbkk@state.gov');
  });

  it('rejects a missing title (400)', async () => {
    const res = await createItem(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId }, token),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a title over the 200-char max (400)', async () => {
    const res = await createItem(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId, title: 'x'.repeat(201) }, token),
    );
    expect(res.status).toBe(400);
  });

  it('rejects content over the 5000-char max (400)', async () => {
    const res = await createItem(
      jsonRequest(
        'http://localhost/api/v1/important-info',
        'POST',
        { tripId, title: 'Insurance', content: 'x'.repeat(5001) },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a javascript: URI in locationMapLink (400) -- same scheme check as shared-fields.schema.ts', async () => {
    const res = await createItem(
      jsonRequest(
        'http://localhost/api/v1/important-info',
        'POST',
        { tripId, title: 'Embassy', locationMapLink: 'javascript:alert(1)' },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('404s when the parent Trip does not exist', async () => {
    const res = await createItem(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId: UNKNOWN_ID, title: 'Orphan' }, token),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated create (401)', async () => {
    const res = await createItem(
      jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId, title: 'Insurance' }, undefined),
    );
    expect(res.status).toBe(401);
  });

  it('returns an empty list when the Trip has none', async () => {
    const res = await listItems(
      jsonRequest(`http://localhost/api/v1/important-info?tripId=${tripId}`, 'GET', undefined, token),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  describe('once an item exists', () => {
    let itemId: string;

    beforeEach(async () => {
      const res = await createItem(
        jsonRequest('http://localhost/api/v1/important-info', 'POST', { tripId, title: 'Travel Insurance' }, token),
      );
      itemId = (await res.json()).id;
    });

    it('edits the item, updating content (200)', async () => {
      const res = await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'PATCH', {
          content: 'Policy #12345, call +1-800-555-0100',
        }, token),
        itemParams(itemId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toBe('Policy #12345, call +1-800-555-0100');
    });

    it('a partial PATCH (only isPrivate) leaves every other field untouched', async () => {
      await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'PATCH', {
          content: 'Policy #12345',
          contactName: 'Insurer Co',
          locationName: 'Branch Office',
        }, token),
        itemParams(itemId),
      );

      const res = await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'PATCH', { isPrivate: true }, token),
        itemParams(itemId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isPrivate).toBe(true);
      expect(body.content).toBe('Policy #12345');
      expect(body.contactName).toBe('Insurer Co');
      expect(body.locationName).toBe('Branch Office');
      expect(body.title).toBe('Travel Insurance');
    });

    it('returns 404 for a PATCH to an unknown/malformed id', async () => {
      const res = await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${UNKNOWN_ID}`, 'PATCH', { title: 'Nope' }, token),
        itemParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);

      const malformedRes = await patchItem(
        jsonRequest('http://localhost/api/v1/important-info/not-a-uuid', 'PATCH', { title: 'Nope' }, token),
        itemParams('not-a-uuid'),
      );
      expect(malformedRes.status).toBe(404);
    });

    it('flips isPrivate with a single PATCH request, no confirm dialog implied', async () => {
      const res = await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'PATCH', { isPrivate: true }, token),
        itemParams(itemId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isPrivate).toBe(true);

      const stored = await testPrisma().importantInfo.findUnique({ where: { id: itemId } });
      expect(stored?.isPrivate).toBe(true);
    });

    it('rejects an unauthenticated PATCH (401)', async () => {
      const res = await patchItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'PATCH', { isPrivate: true }, undefined),
        itemParams(itemId),
      );
      expect(res.status).toBe(401);
    });

    it('deletes the item (204), removing it from the list', async () => {
      const res = await deleteItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'DELETE', undefined, token),
        itemParams(itemId),
      );
      expect(res.status).toBe(204);

      const remaining = await testPrisma().importantInfo.count();
      expect(remaining).toBe(0);
    });

    it('returns 404 for a DELETE of an unknown id', async () => {
      const res = await deleteItem(
        jsonRequest(`http://localhost/api/v1/important-info/${UNKNOWN_ID}`, 'DELETE', undefined, token),
        itemParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated delete (401)', async () => {
      const res = await deleteItem(
        jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'DELETE', undefined, undefined),
        itemParams(itemId),
      );
      expect(res.status).toBe(401);

      const remaining = await testPrisma().importantInfo.count();
      expect(remaining).toBe(1);
    });

    describe('with an uploaded Attachment', () => {
      let attachmentId: string;
      let filePath: string;

      beforeEach(async () => {
        const res = await uploadAttachment(
          uploadRequest(
            'http://localhost/api/v1/attachments',
            { ownerType: 'IMPORTANT_INFO', ownerId: itemId, file: pdfFile() },
            token,
          ),
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        attachmentId = body.id;
        const stored = await testPrisma().attachment.findUnique({ where: { id: attachmentId } });
        filePath = stored!.filePath;
      });

      it('uploads and appears in the item Attachment list, and in the Trip-wide aggregation', async () => {
        const stored = await testPrisma().attachment.findUnique({ where: { id: attachmentId } });
        expect(stored?.ownerType).toBe('IMPORTANT_INFO');
        expect(stored?.tripId).toBe(tripId);
        expect(existsSync(filePath)).toBe(true);

        const { GET: listAttachments } = await import('@/app/api/v1/attachments/route');
        const byOwnerRes = await listAttachments(
          jsonRequest(
            `http://localhost/api/v1/attachments?ownerType=IMPORTANT_INFO&ownerId=${itemId}`,
            'GET',
            undefined,
            token,
          ),
        );
        const byOwnerList = await byOwnerRes.json();
        expect(byOwnerList.map((a: { id: string }) => a.id)).toContain(attachmentId);

        const byTripRes = await listAttachments(
          jsonRequest(`http://localhost/api/v1/attachments?tripId=${tripId}`, 'GET', undefined, token),
        );
        const byTripList = await byTripRes.json();
        expect(byTripList.map((a: { id: string }) => a.id)).toContain(attachmentId);
      });

      it('deleting the item cascades: Attachment rows are gone too', async () => {
        const deleteRes = await deleteItem(
          jsonRequest(`http://localhost/api/v1/important-info/${itemId}`, 'DELETE', undefined, token),
          itemParams(itemId),
        );
        expect(deleteRes.status).toBe(204);

        const remaining = await testPrisma().attachment.count({ where: { ownerId: itemId } });
        expect(remaining).toBe(0);
      });
    });
  });
});
