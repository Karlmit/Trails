import { existsSync, readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import { POST as createIdea } from '@/app/api/v1/ideas/route';
import { issueSession } from '@/lib/session';

// The remote fetch itself is the one thing a route test cannot exercise
// honestly: `fetchRemoteFile` resolves DNS and issues a real outbound GET, and
// its own SSRF guard deliberately refuses every address a local test server
// could bind to. So the network hop is stubbed here and the *pure* helpers it
// is made of (URL parsing, the blocked-address ranges, magic-byte sniffing,
// filename derivation) are covered directly in tests/remote-media.test.ts.
// What this file covers is the part that stub cannot fake: the Route
// Handler's JSON-vs-multipart intake branch, its validation, and that a
// URL-imported Photo lands on disk and in Postgres exactly like an uploaded
// one.
const fetchRemoteFile = vi.hoisted(() => vi.fn());
vi.mock('@/lib/remote-media', async () => {
  const actual = await vi.importActual<typeof import('@/lib/remote-media')>('@/lib/remote-media');
  return { ...actual, fetchRemoteFile };
});

const { POST: postPhoto, GET: listPhotos } = await import('@/app/api/v1/photos/route');
const { POST: postAttachment } = await import('@/app/api/v1/attachments/route');

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** A multipart POST, to prove the JSON branch didn't take the file path's place. */
function uploadRequest(url: string, ownerType: string, ownerId: string, token: string) {
  const formData = new FormData();
  formData.append('ownerType', ownerType);
  formData.append('ownerId', ownerId);
  formData.append('file', new File([new Uint8Array([1, 2, 3, 4])], 'picked.png', { type: 'image/png' }));
  return new NextRequest(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: formData });
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// User-requested: "make it so anywhere I can upload a photo it's also possible
// to just post an image URL, that way the user does not have to actually
// download the photo first."
describe.skipIf(!hasTestDatabase)('photos/attachments URL import', () => {
  let token: string;
  let tripId: string;
  let entryId: string;
  let ideaId: string;

  beforeEach(async () => {
    await resetDb();
    fetchRemoteFile.mockReset();
    fetchRemoteFile.mockResolvedValue({
      ok: true,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      filename: 'beach-hut.png',
    });

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
          subtype: 'BEACH',
          title: 'Beach day',
          startAt: '2026-08-03T10:00:00.000Z',
          locationName: 'The Beach',
        },
        token,
      ),
    );
    entryId = (await entryRes.json()).id;

    const ideaRes = await createIdea(
      jsonRequest(
        'http://localhost/api/v1/ideas',
        'POST',
        { tripId, title: 'Snorkeling', priority: 'MUST_DO', weatherSuitability: 'OUTDOOR' },
        token,
      ),
    );
    ideaId = (await ideaRes.json()).id;
  });

  afterEach(() => {
    fetchRemoteFile.mockReset();
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('imports an image URL into an Idea (201) -- bytes on disk, row in Postgres, same path shape as an upload', async () => {
    const res = await postPhoto(
      jsonRequest(
        'http://localhost/api/v1/photos',
        'POST',
        { ownerType: 'IDEA', ownerId: ideaId, sourceUrl: 'https://example.com/beach-hut.png' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.mimeType).toBe('image/png');
    expect(body.originalFilename).toBe('beach-hut.png');
    expect(body.sizeBytes).toBe(PNG_BYTES.byteLength);
    expect(body.isPrimary).toBe(false);
    expect(body.isPrivate).toBe(false);

    const stored = await testPrisma().photo.findUnique({ where: { id: body.id } });
    expect(stored).not.toBeNull();
    // AD-5's mandatory path shape, identical to the multipart path.
    expect(stored!.filePath).toContain(`/${tripId}/IDEA/${ideaId}/`);
    expect(existsSync(stored!.filePath)).toBe(true);
    expect(readFileSync(stored!.filePath).equals(PNG_BYTES)).toBe(true);

    expect(fetchRemoteFile).toHaveBeenCalledWith(
      'https://example.com/beach-hut.png',
      expect.objectContaining({ allowedMimeTypes: expect.arrayContaining(['image/jpeg', 'image/webp']) }),
    );
  });

  it('appears in the owner list and the Trip-wide aggregate, indistinguishable from an upload', async () => {
    await postPhoto(
      jsonRequest(
        'http://localhost/api/v1/photos',
        'POST',
        { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, sourceUrl: 'https://example.com/a.png' },
        token,
      ),
    );
    await postPhoto(uploadRequest('http://localhost/api/v1/photos', 'TIMELINE_ENTRY', entryId, token));

    const listRes = await listPhotos(
      jsonRequest(`http://localhost/api/v1/photos?ownerType=TIMELINE_ENTRY&ownerId=${entryId}`, 'GET', undefined, token),
    );
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).length).toBe(2);

    const tripRes = await listPhotos(
      jsonRequest(`http://localhost/api/v1/photos?tripId=${tripId}`, 'GET', undefined, token),
    );
    expect((await tripRes.json()).length).toBe(2);
  });

  it('honours isPrivate on the URL path, same as the multipart path', async () => {
    const res = await postPhoto(
      jsonRequest(
        'http://localhost/api/v1/photos',
        'POST',
        { ownerType: 'IDEA', ownerId: ideaId, sourceUrl: 'https://example.com/a.png', isPrivate: true },
        token,
      ),
    );
    expect((await res.json()).isPrivate).toBe(true);
  });

  it('surfaces the fetch failure verbatim as a 400 and writes nothing', async () => {
    fetchRemoteFile.mockResolvedValue({ ok: false, message: 'That URL could not be reached' });
    const res = await postPhoto(
      jsonRequest(
        'http://localhost/api/v1/photos',
        'POST',
        { ownerType: 'IDEA', ownerId: ideaId, sourceUrl: 'https://example.com/gone.png' },
        token,
      ),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe('That URL could not be reached');
    expect(await testPrisma().photo.count()).toBe(0);
  });

  it('rejects a missing/blank sourceUrl, a bad ownerType and a non-UUID ownerId (400, no fetch attempted)', async () => {
    const cases: Record<string, unknown>[] = [
      { ownerType: 'IDEA', ownerId: ideaId },
      { ownerType: 'IDEA', ownerId: ideaId, sourceUrl: '   ' },
      { ownerType: 'CHECKLIST', ownerId: ideaId, sourceUrl: 'https://example.com/a.png' },
      { ownerType: 'IDEA', ownerId: 'not-a-uuid', sourceUrl: 'https://example.com/a.png' },
    ];
    for (const body of cases) {
      const res = await postPhoto(jsonRequest('http://localhost/api/v1/photos', 'POST', body, token));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(fetchRemoteFile).not.toHaveBeenCalled();
    expect(await testPrisma().photo.count()).toBe(0);
  });

  it('404s for an unknown owner -- after fetching, and without leaving the file on disk', async () => {
    const res = await postPhoto(
      jsonRequest(
        'http://localhost/api/v1/photos',
        'POST',
        { ownerType: 'IDEA', ownerId: UNKNOWN_ID, sourceUrl: 'https://example.com/a.png' },
        token,
      ),
    );
    expect(res.status).toBe(404);
    expect(await testPrisma().photo.count()).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await postPhoto(
      jsonRequest('http://localhost/api/v1/photos', 'POST', {
        ownerType: 'IDEA',
        ownerId: ideaId,
        sourceUrl: 'https://example.com/a.png',
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchRemoteFile).not.toHaveBeenCalled();
  });

  it('imports a URL as an Attachment too (Documents accepts PDFs, so its allowlist differs)', async () => {
    fetchRemoteFile.mockResolvedValue({
      ok: true,
      bytes: Buffer.from('%PDF-1.7 ...', 'latin1'),
      mimeType: 'application/pdf',
      filename: 'booking.pdf',
    });
    const res = await postAttachment(
      jsonRequest(
        'http://localhost/api/v1/attachments',
        'POST',
        { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, sourceUrl: 'https://example.com/booking.pdf' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.mimeType).toBe('application/pdf');
    expect(body.originalFilename).toBe('booking.pdf');

    const stored = await testPrisma().attachment.findUnique({ where: { id: body.id } });
    expect(existsSync(stored!.filePath)).toBe(true);

    expect(fetchRemoteFile).toHaveBeenCalledWith(
      'https://example.com/booking.pdf',
      expect.objectContaining({ allowedMimeTypes: expect.arrayContaining(['application/pdf']) }),
    );
  });

  it("rejects an Idea owner for an Attachment URL import (FR-16: Ideas never get Attachments)", async () => {
    const res = await postAttachment(
      jsonRequest(
        'http://localhost/api/v1/attachments',
        'POST',
        { ownerType: 'IDEA', ownerId: ideaId, sourceUrl: 'https://example.com/a.pdf' },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });
});
