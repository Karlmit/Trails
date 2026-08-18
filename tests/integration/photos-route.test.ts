import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listPhotos, POST as uploadPhoto } from '@/app/api/v1/photos/route';
import { DELETE as deletePhoto, PATCH as patchPhoto } from '@/app/api/v1/photos/[photoId]/route';
import { PUT as markPrimary } from '@/app/api/v1/photos/[photoId]/primary/route';
import { GET as filePhoto } from '@/app/api/v1/photos/[photoId]/file/route';
import { POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import { PUT as publishEntry } from '@/app/api/v1/timeline-entries/[entryId]/publish/route';
import { DELETE as deleteEntry } from '@/app/api/v1/timeline-entries/[entryId]/route';
import { POST as createIdea } from '@/app/api/v1/ideas/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function uploadRequest(
  url: string,
  fields: { ownerType?: string; ownerId?: string; file?: File; isPrivate?: string },
  token?: string,
) {
  const formData = new FormData();
  if (fields.ownerType !== undefined) formData.append('ownerType', fields.ownerType);
  if (fields.ownerId !== undefined) formData.append('ownerId', fields.ownerId);
  if (fields.file !== undefined) formData.append('file', fields.file);
  if (fields.isPrivate !== undefined) formData.append('isPrivate', fields.isPrivate);

  return new NextRequest(url, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

function photoParams(photoId: string) {
  return { params: Promise.resolve({ photoId }) };
}

function entryParams(entryId: string) {
  return { params: Promise.resolve({ entryId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

function pngFile(name = 'photo.png'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
}

// FR-3/FR-15/FR-16/FR-26/FR-28, spec-tags-links-photos: Photo upload/list/
// delete/mark-primary/file-serving, covering the spec's frozen I/O matrix.
// Requires a live Postgres via DATABASE_URL and a writable UPLOAD_ROOT.
describe.skipIf(!hasTestDatabase)('photos route', () => {
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
        { tripId, entryType: 'ACTIVITY', subtype: 'BEACH', title: 'Beach day', startAt: '2026-08-03T10:00:00.000Z' },
        token,
      ),
    );
    entryId = (await entryRes.json()).id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('uploads a PNG to an Entry (201, written to disk, appears in its list)', async () => {
    const res = await uploadPhoto(
      uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile() }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.mimeType).toBe('image/png');
    expect(body.isPrimary).toBe(false);
    expect(body.isPrivate).toBe(false);

    const stored = await testPrisma().photo.findUnique({ where: { id: body.id } });
    expect(stored).not.toBeNull();
    expect(existsSync(stored!.filePath)).toBe(true);
    expect(stored!.filePath).toContain(`/${tripId}/TIMELINE_ENTRY/${entryId}/`);

    const listRes = await listPhotos(
      jsonRequest(`http://localhost/api/v1/photos?ownerType=TIMELINE_ENTRY&ownerId=${entryId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((p: { id: string }) => p.id)).toContain(body.id);
  });

  it('rejects a PDF upload (400) -- Photos are image-only, unlike Attachments', async () => {
    const pdf = new File([new Uint8Array([1, 2])], 'doc.pdf', { type: 'application/pdf' });
    const res = await uploadPhoto(
      uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pdf }, token),
    );
    expect(res.status).toBe(400);
    expect(await testPrisma().photo.count()).toBe(0);
  });

  it('accepts IDEA as an owner type (unlike Attachments, which reject it)', async () => {
    const ideaRes = await createIdea(
      jsonRequest('http://localhost/api/v1/ideas', 'POST', { tripId, title: 'Snorkeling', priority: 'MAYBE', weatherSuitability: 'OUTDOOR' }, token),
    );
    const ideaId = (await ideaRes.json()).id;

    const res = await uploadPhoto(
      uploadRequest('http://localhost/api/v1/photos', { ownerType: 'IDEA', ownerId: ideaId, file: pngFile() }, token),
    );
    expect(res.status).toBe(201);
  });

  it('404s when the owner does not exist', async () => {
    const res = await uploadPhoto(
      uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: UNKNOWN_ID, file: pngFile() }, token),
    );
    expect(res.status).toBe(404);
  });

  describe('marking a Photo primary', () => {
    it('atomically swaps: the old primary flips false as the new one flips true (never two at once)', async () => {
      const res1 = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile('a.png') }, token),
      );
      const photo1 = await res1.json();
      const res2 = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile('b.png') }, token),
      );
      const photo2 = await res2.json();

      const primary1 = await markPrimary(
        jsonRequest(`http://localhost/api/v1/photos/${photo1.id}/primary`, 'PUT', undefined, token),
        photoParams(photo1.id),
      );
      expect(primary1.status).toBe(200);
      expect((await primary1.json()).isPrimary).toBe(true);

      const primary2 = await markPrimary(
        jsonRequest(`http://localhost/api/v1/photos/${photo2.id}/primary`, 'PUT', undefined, token),
        photoParams(photo2.id),
      );
      expect(primary2.status).toBe(200);
      expect((await primary2.json()).isPrimary).toBe(true);

      const stored1 = await testPrisma().photo.findUnique({ where: { id: photo1.id } });
      const stored2 = await testPrisma().photo.findUnique({ where: { id: photo2.id } });
      expect(stored1!.isPrimary).toBe(false);
      expect(stored2!.isPrimary).toBe(true);

      const primaryCount = await testPrisma().photo.count({ where: { ownerId: entryId, isPrimary: true } });
      expect(primaryCount).toBe(1);
    });

    it('404s marking primary on an unknown Photo id', async () => {
      const res = await markPrimary(
        jsonRequest(`http://localhost/api/v1/photos/${UNKNOWN_ID}/primary`, 'PUT', undefined, token),
        photoParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('once a Photo exists', () => {
    let photoId: string;
    let filePath: string;

    beforeEach(async () => {
      const res = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile() }, token),
      );
      const body = await res.json();
      photoId = body.id;
      const stored = await testPrisma().photo.findUnique({ where: { id: photoId } });
      filePath = stored!.filePath;
    });

    it('serves the file with correct Content-Type for an authenticated User', async () => {
      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined, token),
        photoParams(photoId),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    });

    it('toggles isPrivate via PATCH', async () => {
      const res = await patchPhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}`, 'PATCH', { isPrivate: true }, token),
        photoParams(photoId),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).isPrivate).toBe(true);
    });

    it('deletes the Photo (204), removing both the row and the file from disk', async () => {
      const res = await deletePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}`, 'DELETE', undefined, token),
        photoParams(photoId),
      );
      expect(res.status).toBe(204);
      expect(await testPrisma().photo.findUnique({ where: { id: photoId } })).toBeNull();
      expect(existsSync(filePath)).toBe(false);
    });

    it('cascades: deleting the owning Entry also removes the Photo file from disk (unlike Attachment\'s cascade)', async () => {
      const res = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'DELETE', undefined, token),
        entryParams(entryId),
      );
      expect(res.status).toBe(204);
      expect(await testPrisma().photo.count({ where: { ownerId: entryId } })).toBe(0);
      expect(existsSync(filePath)).toBe(false);
    });
  });

  // FR-3/FR-28, Acceptance Criteria: "Given a Public Trip's Entry has one
  // Private Photo among several, when a Guest views that Entry's detail
  // page, then exactly the non-Private Photos render." Exercised here as a
  // genuinely cookie-less request straight at the Route Handler (no
  // Authorization header, no session token at all) -- proxy.ts's own
  // allowlisting of this exact path is covered separately in
  // tests/integration/proxy.test.ts.
  describe('Guest access to the Photo file route (FR-3/FR-28, no session)', () => {
    it('serves a non-Private Photo on a Public Trip\'s Entry to an unauthenticated caller', async () => {
      await testPrisma().trip.update({ where: { id: tripId }, data: { visibility: 'PUBLIC' } });
      const uploadRes = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile() }, token),
      );
      const photoId = (await uploadRes.json()).id;

      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(res.status).toBe(200);
    });

    it('404s a Private Photo on an otherwise-Public Trip\'s Entry for an unauthenticated caller', async () => {
      await testPrisma().trip.update({ where: { id: tripId }, data: { visibility: 'PUBLIC' } });
      const uploadRes = await uploadPhoto(
        uploadRequest(
          'http://localhost/api/v1/photos',
          { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile(), isPrivate: 'true' },
          token,
        ),
      );
      const photoId = (await uploadRes.json()).id;

      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(res.status).toBe(404);
    });

    it('404s any Photo on a Private Trip for an unauthenticated caller', async () => {
      // Trip stays PRIVATE (the default) for this test.
      const uploadRes = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: entryId, file: pngFile() }, token),
      );
      const photoId = (await uploadRes.json()).id;

      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(res.status).toBe(404);
    });

    it('404s a Photo on a Draft Blog Post even on a Public Trip (AD-10 Draft exclusion)', async () => {
      await testPrisma().trip.update({ where: { id: tripId }, data: { visibility: 'PUBLIC' } });
      const postRes = await createEntry(
        jsonRequest(
          'http://localhost/api/v1/timeline-entries',
          'POST',
          { tripId, entryType: 'BLOG_POST', title: 'Draft post', startAt: '2026-08-05T10:00:00.000Z' },
          token,
        ),
      );
      const postId = (await postRes.json()).id;
      const uploadRes = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'TIMELINE_ENTRY', ownerId: postId, file: pngFile() }, token),
      );
      const photoId = (await uploadRes.json()).id;

      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(res.status).toBe(404);

      // Sanity: once Published, the same Photo becomes reachable.
      await publishEntry(jsonRequest(`http://localhost/api/v1/timeline-entries/${postId}/publish`, 'PUT', undefined, token), entryParams(postId));
      const publishedRes = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(publishedRes.status).toBe(200);
    });

    it('404s a Photo owned by an Idea, even on a Public Trip (no Guest surface for Ideas at all)', async () => {
      await testPrisma().trip.update({ where: { id: tripId }, data: { visibility: 'PUBLIC' } });
      const ideaRes = await createIdea(
        jsonRequest('http://localhost/api/v1/ideas', 'POST', { tripId, title: 'Snorkeling', priority: 'MAYBE', weatherSuitability: 'OUTDOOR' }, token),
      );
      const ideaId = (await ideaRes.json()).id;
      const uploadRes = await uploadPhoto(
        uploadRequest('http://localhost/api/v1/photos', { ownerType: 'IDEA', ownerId: ideaId, file: pngFile() }, token),
      );
      const photoId = (await uploadRes.json()).id;

      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${photoId}/file`, 'GET', undefined),
        photoParams(photoId),
      );
      expect(res.status).toBe(404);
    });

    it('404s for an unknown Photo id (never confirms existence)', async () => {
      const res = await filePhoto(
        jsonRequest(`http://localhost/api/v1/photos/${UNKNOWN_ID}/file`, 'GET', undefined),
        photoParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);
    });
  });
});
