import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listAttachments, POST as uploadAttachment } from '@/app/api/v1/attachments/route';
import { DELETE as deleteAttachment } from '@/app/api/v1/attachments/[attachmentId]/route';
import { GET as fileAttachment } from '@/app/api/v1/attachments/[attachmentId]/file/route';
import { DELETE as deleteEntry } from '@/app/api/v1/timeline-entries/[entryId]/route';
import { POST as createEntry } from '@/app/api/v1/timeline-entries/route';
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

function entryParams(entryId: string) {
  return { params: Promise.resolve({ entryId }) };
}

function attachmentParams(attachmentId: string) {
  return { params: Promise.resolve({ attachmentId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

function pdfFile(name = 'ticket.pdf'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'application/pdf' });
}

// FR-24/FR-25, spec-documents: Attachment upload/list/delete/file-serving,
// mirroring app/api/v1/checklists' Route Handler test conventions -- covers
// the spec's frozen I/O matrix. Requires a live Postgres via DATABASE_URL,
// and a writable UPLOAD_ROOT (/data/uploads) on this machine.
describe.skipIf(!hasTestDatabase)('attachments route', () => {
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
          entryType: 'STAY',
          title: 'Beach Resort',
          subtype: 'RESORT',
          startAt: '2026-08-03T14:00:00.000Z',
          endAt: '2026-08-06T11:00:00.000Z',
        },
        token,
      ),
    );
    entryId = (await entryRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('uploads a PDF to a Stay (201, written to disk, appears in its Attachment list)', async () => {
    const res = await uploadAttachment(
      uploadRequest(
        'http://localhost/api/v1/attachments',
        { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile() },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.originalFilename).toBe('ticket.pdf');
    expect(body.mimeType).toBe('application/pdf');
    expect(body.tripId).toBe(tripId);

    const stored = await testPrisma().attachment.findUnique({ where: { id: body.id } });
    expect(stored).not.toBeNull();
    expect(existsSync(stored!.filePath)).toBe(true);
    expect(stored!.filePath).toContain(`/${tripId}/TIMELINE_ENTRY/${entryId}/`);

    const listRes = await listAttachments(
      jsonRequest(
        `http://localhost/api/v1/attachments?ownerType=TIMELINE_ENTRY&ownerId=${entryId}`,
        'GET',
        undefined,
        token,
      ),
    );
    const list = await listRes.json();
    expect(list.map((a: { id: string }) => a.id)).toContain(body.id);
  });

  it('rejects an unsupported format before any write (400)', async () => {
    const exe = new File([new Uint8Array([1, 2])], 'virus.exe', { type: 'application/x-msdownload' });
    const res = await uploadAttachment(
      uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: exe }, token),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const count = await testPrisma().attachment.count();
    expect(count).toBe(0);
  });

  it('rejects an upload with no file part (400)', async () => {
    const res = await uploadAttachment(
      uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId }, token),
    );
    expect(res.status).toBe(400);
  });

  it('404s when the owner TimelineEntry does not exist', async () => {
    const res = await uploadAttachment(
      uploadRequest(
        'http://localhost/api/v1/attachments',
        { ownerType: 'TIMELINE_ENTRY', ownerId: UNKNOWN_ID, file: pdfFile() },
        token,
      ),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated upload (401)', async () => {
    const res = await uploadAttachment(
      uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile() }),
    );
    expect(res.status).toBe(401);
  });

  describe('once an Attachment exists', () => {
    let attachmentId: string;
    let filePath: string;

    beforeEach(async () => {
      const res = await uploadAttachment(
        uploadRequest(
          'http://localhost/api/v1/attachments',
          { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile() },
          token,
        ),
      );
      const body = await res.json();
      attachmentId = body.id;
      const stored = await testPrisma().attachment.findUnique({ where: { id: attachmentId } });
      filePath = stored!.filePath;
    });

    it('downloads the file with correct Content-Type and original filename (200)', async () => {
      const res = await fileAttachment(
        jsonRequest(`http://localhost/api/v1/attachments/${attachmentId}/file`, 'GET', undefined, token),
        attachmentParams(attachmentId),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('ticket.pdf');
    });

    it('rejects an unauthenticated download (401)', async () => {
      const res = await fileAttachment(
        jsonRequest(`http://localhost/api/v1/attachments/${attachmentId}/file`, 'GET', undefined),
        attachmentParams(attachmentId),
      );
      expect(res.status).toBe(401);
    });

    it('deletes the Attachment (204), removes the row and the file from disk', async () => {
      const res = await deleteAttachment(
        jsonRequest(`http://localhost/api/v1/attachments/${attachmentId}`, 'DELETE', undefined, token),
        attachmentParams(attachmentId),
      );
      expect(res.status).toBe(204);

      const stored = await testPrisma().attachment.findUnique({ where: { id: attachmentId } });
      expect(stored).toBeNull();
      expect(existsSync(filePath)).toBe(false);
    });

    it('returns 404 for a DELETE of an unknown/malformed attachment id', async () => {
      const res = await deleteAttachment(
        jsonRequest(`http://localhost/api/v1/attachments/${UNKNOWN_ID}`, 'DELETE', undefined, token),
        attachmentParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);

      const malformedRes = await deleteAttachment(
        jsonRequest('http://localhost/api/v1/attachments/not-a-uuid', 'DELETE', undefined, token),
        attachmentParams('not-a-uuid'),
      );
      expect(malformedRes.status).toBe(404);
    });
  });

  describe('Trip-wide aggregation (?tripId=, FR-25)', () => {
    it('returns an empty list when the Trip has no Attachments', async () => {
      const res = await listAttachments(
        jsonRequest(`http://localhost/api/v1/attachments?tripId=${tripId}`, 'GET', undefined, token),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('aggregates Attachments across multiple Entries into one flat list', async () => {
      const secondEntryRes = await createEntry(
        jsonRequest(
          'http://localhost/api/v1/timeline-entries',
          'POST',
          {
            tripId,
            entryType: 'TRANSPORT',
            subtype: 'FLIGHT',
            title: 'Flight to BKK',
            startAt: '2026-08-01T10:00:00.000Z',
            endAt: '2026-08-01T20:00:00.000Z',
          },
          token,
        ),
      );
      const secondEntryId = (await secondEntryRes.json()).id;

      await uploadAttachment(
        uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile('hotel.pdf') }, token),
      );
      await uploadAttachment(
        uploadRequest(
          'http://localhost/api/v1/attachments',
          { ownerType: 'TIMELINE_ENTRY', ownerId: secondEntryId, file: new File([new Uint8Array([1])], 'boarding-pass.png', { type: 'image/png' }) },
          token,
        ),
      );

      const res = await listAttachments(
        jsonRequest(`http://localhost/api/v1/attachments?tripId=${tripId}`, 'GET', undefined, token),
      );
      const list = await res.json();
      expect(list).toHaveLength(2);
      expect(list.map((a: { originalFilename: string }) => a.originalFilename).sort()).toEqual([
        'boarding-pass.png',
        'hotel.pdf',
      ]);
    });
  });

  describe('deleting the owning TimelineEntry', () => {
    it('cascades: Attachment rows are gone too (files remain on disk, deferred cleanup)', async () => {
      const res1 = await uploadAttachment(
        uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile('a.pdf') }, token),
      );
      const res2 = await uploadAttachment(
        uploadRequest('http://localhost/api/v1/attachments', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdfFile('b.pdf') }, token),
      );
      const attachment1 = await res1.json();
      const attachment2 = await res2.json();
      expect(await testPrisma().attachment.count({ where: { ownerId: entryId } })).toBe(2);

      const stored1 = await testPrisma().attachment.findUnique({ where: { id: attachment1.id } });
      const stored2 = await testPrisma().attachment.findUnique({ where: { id: attachment2.id } });

      const deleteRes = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'DELETE', undefined, token),
        entryParams(entryId),
      );
      expect(deleteRes.status).toBe(204);

      // Rows are gone (no orphaned DB rows, per the spec's Acceptance
      // Criteria) -- this is the frozen I/O matrix's cascade.
      const remaining = await testPrisma().attachment.count({ where: { ownerId: entryId } });
      expect(remaining).toBe(0);

      // Files are deliberately left on disk (frozen I/O matrix: "rows only;
      // files remain on disk, logged as deferred cleanup").
      expect(existsSync(stored1!.filePath)).toBe(true);
      expect(existsSync(stored2!.filePath)).toBe(true);
    });
  });
});
