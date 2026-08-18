import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listEntries, POST as createEntry } from '@/app/api/v1/timeline-entries/route';
import {
  DELETE as deleteEntry,
  GET as getEntry,
  PATCH as patchEntry,
} from '@/app/api/v1/timeline-entries/[entryId]/route';
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

// FR-11-FR-15, AD-1: TimelineEntry CRUD -- covers the spec's I/O matrix.
// Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('timeline-entries route', () => {
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

  it('creates a Stay entry spanning multiple nights (201)', async () => {
    const res = await createEntry(
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
          locationName: 'Beach Resort',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entryType).toBe('STAY');
    expect(body.subtype).toBe('RESORT');
    expect(body.startAt).toBe('2026-08-03T14:00:00.000Z');
  });

  it('rejects a Stay whose check-out is not later than check-in (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'STAY',
          title: 'Beach Resort',
          subtype: 'RESORT',
          startAt: '2026-08-03T14:00:00.000Z',
          endAt: '2026-08-03T14:00:00.000Z',
          locationName: 'Beach Resort',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  // spec-entry-fields-datepickers: Location name doubles as the Entry's
  // Title now for Stay/Transport/Activity -- required end to end, not just
  // at the schema-unit level (see tests/entry-types-schemas.test.ts for the
  // schema-only coverage).
  it('rejects a Stay create missing Location name ("Location name is required", 400)', async () => {
    const res = await createEntry(
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
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/location name is required/i);
  });

  // spec-entry-fields-datepickers: website/bookedVia, new additive fields
  // alongside bookingReference -- stored and read back end to end.
  it('creates a Stay with a Website and Booked via, both stored and read back (201)', async () => {
    const res = await createEntry(
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
          locationName: 'Beach Resort',
          website: 'https://example-resort.com',
          bookedVia: 'StayForLong',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.website).toBe('https://example-resort.com');
    expect(body.bookedVia).toBe('StayForLong');
  });

  it('rejects a javascript: URI as the Website (400, same scheme check as locationMapLink)', async () => {
    const res = await createEntry(
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
          locationName: 'Beach Resort',
          website: 'javascript:alert(1)',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a Booked via value over the max length (400)', async () => {
    const res = await createEntry(
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
          locationName: 'Beach Resort',
          bookedVia: 'x'.repeat(201),
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a Note that supplies a website field (400, Note carries none)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'NOTE',
          title: 'Bring reef-safe sunscreen',
          startAt: '2026-08-04T00:00:00.000Z',
          website: 'https://example.com',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('creates a Transport entry (201)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'TRANSPORT',
          title: 'Flight to Phuket',
          subtype: 'FLIGHT',
          startAt: '2026-08-03T08:00:00.000Z',
          endAt: '2026-08-03T10:00:00.000Z',
          locationName: 'Phuket Airport',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
  });

  it('rejects a Transport whose arrival is not later than departure (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'TRANSPORT',
          title: 'Flight to Phuket',
          subtype: 'FLIGHT',
          startAt: '2026-08-03T08:00:00.000Z',
          endAt: '2026-08-03T07:00:00.000Z',
          locationName: 'Phuket Airport',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('creates a single-day Activity with no end datetime (201)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Boat tour',
          subtype: 'TOUR',
          startAt: '2026-08-05T09:00:00.000Z',
          locationName: 'Marina Pier',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.endAt).toBeNull();
  });

  it('accepts an Activity whose end equals its start (point-in-time, 201)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Sunset viewpoint',
          subtype: 'ATTRACTION',
          startAt: '2026-08-05T18:00:00.000Z',
          endAt: '2026-08-05T18:00:00.000Z',
          locationName: 'Sunset viewpoint',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
  });

  it('creates a Note with only a title and date, and no booking/expense fields shown (201)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'NOTE',
          title: 'Bring reef-safe sunscreen',
          startAt: '2026-08-04T00:00:00.000Z',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bookingReference).toBeNull();
    expect(body.expenseAmount).toBeNull();
    expect(body.locationName).toBeNull();
  });

  it('rejects a Note that supplies a booking reference (400, FR-14)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'NOTE',
          title: 'Bring reef-safe sunscreen',
          startAt: '2026-08-04T00:00:00.000Z',
          bookingReference: 'ABC123',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a Stay given a Transport subtype value, naming the allowed set (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'STAY',
          title: 'Beach Resort',
          subtype: 'FLIGHT',
          startAt: '2026-08-03T14:00:00.000Z',
          endAt: '2026-08-06T11:00:00.000Z',
          locationName: 'Beach Resort',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/subtype must be one of/i);
    expect(body.error.message).toContain('HOTEL');
  });

  it('rejects an Expense with an amount but no currency (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Museum visit',
          subtype: 'MUSEUM',
          startAt: '2026-08-05T09:00:00.000Z',
          locationName: 'National Museum',
          expenseAmount: 20,
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a negative Expense amount (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Museum visit',
          subtype: 'MUSEUM',
          startAt: '2026-08-05T09:00:00.000Z',
          locationName: 'National Museum',
          expenseAmount: -5,
          expenseCurrency: 'usd',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  // spec-blog, FR-18: creating a Blog Post always starts it as a Draft
  // (`publishedAt` is never a field on this create path at all, AD-10) --
  // matches the I/O matrix's "Create Blog Post" row exactly.
  it('creates a Blog Post as a Draft (201), which never appears on the list (AD-10)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        { tripId, entryType: 'BLOG_POST', title: 'A journal entry', startAt: '2026-08-05T00:00:00.000Z' },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entryType).toBe('BLOG_POST');
    expect(body.publishedAt).toBeNull();

    const listRes = await listEntries(
      jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
    );
    const listBody = await listRes.json();
    expect(listBody.find((e: { id: string }) => e.id === body.id)).toBeUndefined();
  });

  it('rejects a Blog Post create missing its required date (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        { tripId, entryType: 'BLOG_POST', title: 'A journal entry' },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a Blog Post create/edit that supplies publishedAt directly (400, .strict())', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'BLOG_POST',
          title: 'A journal entry',
          startAt: '2026-08-05T00:00:00.000Z',
          publishedAt: '2026-08-05T00:00:00.000Z',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  // Item 6: an Entry outside its parent Trip's own date range (2026-08-01 to
  // 2026-08-20 here) must 400 at create -- accepting it would leave
  // silently-invisible data (layoutTimelineEntries defensively drops it).
  it('rejects a create whose startAt falls before the Trip start date (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'NOTE',
          title: 'Too early',
          startAt: '2026-07-31T00:00:00.000Z',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a create whose endAt falls after the Trip end date (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Too late',
          subtype: 'TOUR',
          startAt: '2026-08-19T09:00:00.000Z',
          endAt: '2026-08-25T09:00:00.000Z',
          locationName: 'Somewhere',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  // Item 3: locationMapLink must reject a non-http(s) scheme end to end,
  // not just at the schema-unit level.
  it('rejects a javascript: URI as the map link (400)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'ACTIVITY',
          title: 'Museum visit',
          subtype: 'MUSEUM',
          startAt: '2026-08-05T09:00:00.000Z',
          locationName: 'National Museum',
          locationMapLink: 'javascript:alert(1)',
        },
        token,
      ),
    );
    expect(res.status).toBe(400);
  });

  // Item 5: FR-15's Contact Information capability applies to every type,
  // Note included -- must actually be stored, not dropped.
  it('creates a Note carrying Contact fields (201)', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId,
          entryType: 'NOTE',
          title: 'Bring reef-safe sunscreen',
          startAt: '2026-08-04T00:00:00.000Z',
          contactName: 'Dive shop',
          contactPhone: '+66-76-000-000',
          contactEmail: 'dive@example.com',
        },
        token,
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contactName).toBe('Dive shop');
    expect(body.contactEmail).toBe('dive@example.com');
  });

  it('404s when the parent Trip does not exist', async () => {
    const res = await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        {
          tripId: UNKNOWN_ID,
          entryType: 'NOTE',
          title: 'Orphan note',
          startAt: '2026-08-05T00:00:00.000Z',
        },
        token,
      ),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated create (401)', async () => {
    const res = await createEntry(
      jsonRequest('http://localhost/api/v1/timeline-entries', 'POST', {
        tripId,
        entryType: 'NOTE',
        title: 'Orphan note',
        startAt: '2026-08-05T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(401);
  });

  // spec-blog, AD-10: "Excluding Draft Blog Posts from Timeline rendering is
  // an unconditional base-query filter, applied to every viewer including
  // authenticated Users -- it is not part of Guest filtering." This is the
  // crux the spec calls out explicitly -- covered against the list endpoint
  // here (the Timeline Server Component's own query is covered by
  // tests/timeline.test.ts's layoutTimelineEntries/timelineVisibleEntryWhere
  // coverage), and against direct read/write access, which -- unlike
  // Timeline rendering -- a Draft Blog Post is NOT excluded from (its own
  // management surface, /trips/[tripId]/blog, must be able to read/edit/
  // delete a Draft).
  describe('BLOG_POST Draft/Published (AD-10)', () => {
    let draftId: string;
    let publishedId: string;

    beforeEach(async () => {
      const draft = await testPrisma().timelineEntry.create({
        data: {
          tripId,
          entryType: 'BLOG_POST',
          title: 'Draft entry',
          startAt: new Date('2026-08-05T00:00:00.000Z'),
        },
      });
      draftId = draft.id;

      const published = await testPrisma().timelineEntry.create({
        data: {
          tripId,
          entryType: 'BLOG_POST',
          title: 'Published entry',
          startAt: new Date('2026-08-06T00:00:00.000Z'),
          publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });
      publishedId = published.id;
    });

    it('excludes the Draft from the list endpoint but includes the Published one', async () => {
      const res = await listEntries(
        jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
      );
      expect(res.status).toBe(200);
      const ids = (await res.json()).map((e: { id: string }) => e.id);
      expect(ids).not.toContain(draftId);
      expect(ids).toContain(publishedId);
    });

    it('still allows a direct GET of the Draft (its own management surface needs this, unlike the Timeline)', async () => {
      const res = await getEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${draftId}`, 'GET', undefined, token),
        entryParams(draftId),
      );
      expect(res.status).toBe(200);
    });

    it('allows editing and deleting a Draft directly', async () => {
      const patchRes = await patchEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${draftId}`, 'PATCH', { title: 'Renamed draft' }, token),
        entryParams(draftId),
      );
      expect(patchRes.status).toBe(200);
      expect((await patchRes.json()).title).toBe('Renamed draft');

      const deleteRes = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${draftId}`, 'DELETE', undefined, token),
        entryParams(draftId),
      );
      expect(deleteRes.status).toBe(204);
    });
  });

  it('lists entries for a Trip in start-date order', async () => {
    await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        { tripId, entryType: 'NOTE', title: 'Later note', startAt: '2026-08-10T00:00:00.000Z' },
        token,
      ),
    );
    await createEntry(
      jsonRequest(
        'http://localhost/api/v1/timeline-entries',
        'POST',
        { tripId, entryType: 'NOTE', title: 'Earlier note', startAt: '2026-08-02T00:00:00.000Z' },
        token,
      ),
    );

    const res = await listEntries(
      jsonRequest(`http://localhost/api/v1/timeline-entries?tripId=${tripId}`, 'GET', undefined, token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((e: { title: string }) => e.title)).toEqual(['Earlier note', 'Later note']);
  });

  describe('detail: GET/PATCH/DELETE', () => {
    let entryId: string;

    beforeEach(async () => {
      const res = await createEntry(
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
            locationName: 'Beach Resort',
          },
          token,
        ),
      );
      entryId = (await res.json()).id;
    });

    it('gets a single Entry', async () => {
      const res = await getEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'GET', undefined, token),
        entryParams(entryId),
      );
      expect(res.status).toBe(200);
    });

    it('updates a field via PATCH', async () => {
      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { title: 'Beach Resort (renamed)' },
          token,
        ),
        entryParams(entryId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Beach Resort (renamed)');
    });

    // spec-guest-access (FR-28): isPrivate persists through create and is
    // read back via GET, defaulting to false when omitted on create.
    it('defaults isPrivate to false when omitted on create', async () => {
      const res = await getEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'GET', undefined, token),
        entryParams(entryId),
      );
      const body = await res.json();
      expect(body.isPrivate).toBe(false);
    });

    it('persists isPrivate: true set at create time', async () => {
      const created = await createEntry(
        jsonRequest(
          'http://localhost/api/v1/timeline-entries',
          'POST',
          {
            tripId,
            entryType: 'NOTE',
            title: 'A private note',
            startAt: '2026-08-04T00:00:00.000Z',
            isPrivate: true,
          },
          token,
        ),
      );
      expect((await created.json()).isPrivate).toBe(true);
    });

    it('sets isPrivate via PATCH', async () => {
      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { isPrivate: true },
          token,
        ),
        entryParams(entryId),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).isPrivate).toBe(true);
    });

    // Matches this codebase's documented "partial-PATCH inversion" bug
    // class (see toEntryUpdateData's merge-before-validate pattern): a PATCH
    // that never mentions isPrivate must leave the stored flag untouched,
    // never silently resetting it to false.
    it('leaves a stored isPrivate: true untouched by a PATCH that omits the field', async () => {
      await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { isPrivate: true },
          token,
        ),
        entryParams(entryId),
      );

      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { title: 'Beach Resort (still private)' },
          token,
        ),
        entryParams(entryId),
      );
      expect((await res.json()).isPrivate).toBe(true);
    });

    it('rejects a startAt-only PATCH that would invert the stored endAt (400)', async () => {
      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { startAt: '2026-08-09T00:00:00.000Z' },
          token,
        ),
        entryParams(entryId),
      );
      expect(res.status).toBe(400);
    });

    // Item 6: the *merged* start/end must still fall within the parent
    // Trip's own date range (2026-08-01 to 2026-08-20 here) after a PATCH.
    it('rejects a PATCH whose merged startAt/endAt falls outside the Trip range (400)', async () => {
      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { startAt: '2026-08-25T00:00:00.000Z', endAt: '2026-08-26T00:00:00.000Z' },
          token,
        ),
        entryParams(entryId),
      );
      expect(res.status).toBe(400);
    });

    // Item 4: clearing an Entry's End field on edit must actually clear it
    // server-side (explicit `endAt: null`), mirroring the Expense pair's
    // already-correct null-clearing.
    it('clears a stored endAt when PATCHed with endAt: null (Activity)', async () => {
      const created = await createEntry(
        jsonRequest(
          'http://localhost/api/v1/timeline-entries',
          'POST',
          {
            tripId,
            entryType: 'ACTIVITY',
            title: 'Boat tour',
            subtype: 'TOUR',
            startAt: '2026-08-05T09:00:00.000Z',
            endAt: '2026-08-05T12:00:00.000Z',
            locationName: 'Marina Pier',
          },
          token,
        ),
      );
      const activityId = (await created.json()).id;

      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${activityId}`,
          'PATCH',
          { endAt: null },
          token,
        ),
        entryParams(activityId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.endAt).toBeNull();
    });

    // Item 7: clearing the Expense pair (amount+currency both null) must
    // also clear its dependent payment status/note, not leave them orphaned.
    it('clears expensePaymentStatus/expensePaymentNote when the Expense pair is cleared', async () => {
      const created = await createEntry(
        jsonRequest(
          'http://localhost/api/v1/timeline-entries',
          'POST',
          {
            tripId,
            entryType: 'ACTIVITY',
            title: 'Museum visit',
            subtype: 'MUSEUM',
            startAt: '2026-08-05T09:00:00.000Z',
            locationName: 'National Museum',
            expenseAmount: 20,
            expenseCurrency: 'USD',
            expensePaymentStatus: 'Paid',
            expensePaymentNote: 'Paid in cash',
          },
          token,
        ),
      );
      const activityId = (await created.json()).id;

      // Clears only the pair -- payment status/note are deliberately *not*
      // included in this PATCH body, to prove the server clears them too
      // rather than relying on the client to also send them null.
      const res = await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${activityId}`,
          'PATCH',
          { expenseAmount: null, expenseCurrency: null },
          token,
        ),
        entryParams(activityId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.expenseAmount).toBeNull();
      expect(body.expenseCurrency).toBeNull();
      expect(body.expensePaymentStatus).toBeNull();
      expect(body.expensePaymentNote).toBeNull();
    });

    it('does not overwrite typeDetails when a PATCH omits it', async () => {
      await patchEntry(
        jsonRequest(
          `http://localhost/api/v1/timeline-entries/${entryId}`,
          'PATCH',
          { typeDetails: { roomInfo: 'Ocean view king' } },
          token,
        ),
        entryParams(entryId),
      );

      const res = await patchEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'PATCH', { title: 'Renamed' }, token),
        entryParams(entryId),
      );
      const body = await res.json();
      expect(body.typeDetails).toEqual({ roomInfo: 'Ocean view king' });
    });

    it('deletes an Entry (204)', async () => {
      const res = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'DELETE', undefined, token),
        entryParams(entryId),
      );
      expect(res.status).toBe(204);

      const remaining = await testPrisma().timelineEntry.count();
      expect(remaining).toBe(0);
    });

    it('returns 404 for an unknown/malformed id', async () => {
      const res = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/not-a-uuid`, 'DELETE', undefined, token),
        entryParams('not-a-uuid'),
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated PATCH/DELETE', async () => {
      const patchRes = await patchEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'PATCH', { title: 'Nope' }),
        entryParams(entryId),
      );
      expect(patchRes.status).toBe(401);

      const deleteRes = await deleteEntry(
        jsonRequest(`http://localhost/api/v1/timeline-entries/${entryId}`, 'DELETE', undefined),
        entryParams(entryId),
      );
      expect(deleteRes.status).toBe(401);
    });
  });
});
