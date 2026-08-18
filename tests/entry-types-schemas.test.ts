import { describe, expect, it } from 'vitest';
import { stayCreateSchema, STAY_SUBTYPES } from '@/lib/entry-types/stay.schema';
import { transportCreateSchema } from '@/lib/entry-types/transport.schema';
import { activityCreateSchema } from '@/lib/entry-types/activity.schema';
import { noteCreateSchema } from '@/lib/entry-types/note.schema';
import { blogPostCreateSchema, blogPostUpdateSchema } from '@/lib/entry-types/blog-post.schema';

const TRIP_ID = '11111111-1111-4111-8111-111111111111';

// AD-1/FR-11-FR-15: one Zod schema per entry_type, validated at the exact
// per-type boundary this spec puts weight on (subtype enforcement, shared
// end-date ordering rules, Note's narrower field set, the Expense pair).
describe('lib/entry-types/*.schema.ts', () => {
  describe('stayCreateSchema (FR-11)', () => {
    const base = {
      tripId: TRIP_ID,
      title: 'Beach Resort',
      subtype: 'RESORT',
      startAt: '2026-08-03T14:00:00.000Z',
      locationName: 'Beach Resort',
    };

    // spec-entry-fields-datepickers: Location name doubles as this Entry's
    // Title now -- required for Stay/Transport/Activity specifically
    // (locationFields itself, shared by Idea/ImportantInfo too, stays
    // optional -- only these 3 type schemas override it).
    it('rejects a missing locationName ("Location name is required")', () => {
      const { locationName: _omit, ...withoutLocationName } = base;
      const result = stayCreateSchema.safeParse({ ...withoutLocationName, endAt: '2026-08-06T11:00:00.000Z' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/location name is required/i);
      }
    });

    it('rejects an empty-string locationName', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        locationName: '',
        endAt: '2026-08-06T11:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    it('accepts and stores a Website URL', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        website: 'https://example-resort.com',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.website).toBe('https://example-resort.com');
    });

    it('rejects a javascript: URI as the Website (same scheme check as locationMapLink)', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        website: 'javascript:alert(1)',
      });
      expect(result.success).toBe(false);
    });

    it('accepts and stores a Booked via value', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        bookedVia: 'StayForLong',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.bookedVia).toBe('StayForLong');
    });

    it('rejects a Booked via value over the max length', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        bookedVia: 'x'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('rejects check-out not later than check-in', () => {
      const result = stayCreateSchema.safeParse({ ...base, endAt: '2026-08-03T14:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('accepts a strictly later check-out', () => {
      const result = stayCreateSchema.safeParse({ ...base, endAt: '2026-08-06T11:00:00.000Z' });
      expect(result.success).toBe(true);
    });

    it('rejects a Transport subtype value, naming the allowed Stay set', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        subtype: 'FLIGHT',
        endAt: '2026-08-06T11:00:00.000Z',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? '';
        expect(message).toMatch(/subtype must be one of/i);
        for (const value of STAY_SUBTYPES) expect(message).toContain(value);
        expect(message).not.toContain('FLIGHT');
      }
    });

    // Item 1: `.strict()` must match Note's schema across every type -- an
    // unexpected/misspelled field 400s instead of being silently stripped.
    it('rejects an unexpected field (strict schema, matches Note)', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        notARealField: 'oops',
      });
      expect(result.success).toBe(false);
    });

    // Item 3: locationMapLink must reject a non-http(s) scheme, not just
    // "any string" -- a bare `.url()` still accepts `javascript:` URIs.
    it('rejects a javascript: URI as the map link', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        locationMapLink: 'javascript:alert(1)',
      });
      expect(result.success).toBe(false);
    });

    it('accepts a valid https map link', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        locationMapLink: 'https://maps.google.com/?q=resort',
      });
      expect(result.success).toBe(true);
    });

    // Item 8: expenseAmount is bounded to the DB column's Decimal(12,2)
    // range so an oversized value 400s cleanly instead of failing unhandled
    // at the Postgres layer.
    it('rejects an Expense amount above the Decimal(12,2) column bound', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        expenseAmount: 10000000000,
        expenseCurrency: 'USD',
      });
      expect(result.success).toBe(false);
    });

    it('accepts an Expense amount at the Decimal(12,2) column bound', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        expenseAmount: 9999999999.99,
        expenseCurrency: 'USD',
      });
      expect(result.success).toBe(true);
    });

    // spec-guest-access (FR-28): isPrivateField wired into every type's
    // schema, Stay included.
    it('accepts an isPrivate flag', () => {
      const result = stayCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-06T11:00:00.000Z',
        isPrivate: true,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrivate).toBe(true);
    });

    it('leaves isPrivate undefined (not defaulted) when omitted from the schema layer', () => {
      const result = stayCreateSchema.safeParse({ ...base, endAt: '2026-08-06T11:00:00.000Z' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrivate).toBeUndefined();
    });
  });

  describe('transportCreateSchema (FR-12)', () => {
    const base = {
      tripId: TRIP_ID,
      title: 'Flight to Phuket',
      subtype: 'FLIGHT',
      startAt: '2026-08-03T08:00:00.000Z',
      locationName: 'Suvarnabhumi Airport',
    };

    // spec-entry-fields-datepickers: same required-locationName override as
    // stayCreateSchema (see its own test's comment).
    it('rejects a missing locationName ("Location name is required")', () => {
      const { locationName: _omit, ...withoutLocationName } = base;
      const result = transportCreateSchema.safeParse({
        ...withoutLocationName,
        endAt: '2026-08-03T10:00:00.000Z',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/location name is required/i);
      }
    });

    it('accepts a Website and Booked via value', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-03T10:00:00.000Z',
        website: 'https://airline.example.com',
        bookedVia: 'Airline direct',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.website).toBe('https://airline.example.com');
        expect(result.data.bookedVia).toBe('Airline direct');
      }
    });

    it('rejects arrival not later than departure', () => {
      const result = transportCreateSchema.safeParse({ ...base, endAt: '2026-08-03T08:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('accepts a strictly later arrival', () => {
      const result = transportCreateSchema.safeParse({ ...base, endAt: '2026-08-03T10:00:00.000Z' });
      expect(result.success).toBe(true);
    });

    // spec-timeline-ux-and-timezone (correction): startTimezone/endTimezone
    // are optional/nullable IANA-validated fields -- the actual real-instant
    // recomputation is Route Handler territory (applyEntryLegTimezones),
    // not this schema's job.
    it('accepts valid startTimezone/endTimezone values', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-03T10:00:00.000Z',
        startTimezone: 'Asia/Bangkok',
        endTimezone: 'America/Los_Angeles',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTimezone).toBe('Asia/Bangkok');
        expect(result.data.endTimezone).toBe('America/Los_Angeles');
      }
    });

    it('rejects an invalid IANA timezone string', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-03T10:00:00.000Z',
        startTimezone: 'Not/A_Real_Zone',
      });
      expect(result.success).toBe(false);
    });

    it('defaults startTimezone/endTimezone to undefined when omitted', () => {
      const result = transportCreateSchema.safeParse({ ...base, endAt: '2026-08-03T10:00:00.000Z' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startTimezone).toBeUndefined();
        expect(result.data.endTimezone).toBeUndefined();
      }
    });

    // This is exactly the user-reported correctness gap: a long-haul flight
    // whose arrival *literal clock time* reads earlier than its departure's
    // is a perfectly normal flight, not an inverted pair -- the schema must
    // not reject it purely on that naive comparison once either leg
    // declares a real timezone (the Route Handler re-checks order against
    // the real, zone-corrected instants instead).
    it('accepts an arrival literal clock time earlier than departure once a leg declares a timezone', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        startAt: '2026-08-05T18:00:00.000Z',
        endAt: '2026-08-05T12:00:00.000Z',
        startTimezone: 'Asia/Tokyo',
        endTimezone: 'America/Los_Angeles',
      });
      expect(result.success).toBe(true);
    });

    it('still rejects a naive arrival-not-later-than-departure when neither leg declares a timezone', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        startAt: '2026-08-05T18:00:00.000Z',
        endAt: '2026-08-05T12:00:00.000Z',
      });
      expect(result.success).toBe(false);
    });

    // Item 1: `.strict()` must match Note's schema across every type.
    it('rejects an unexpected field (strict schema, matches Note)', () => {
      const result = transportCreateSchema.safeParse({
        ...base,
        endAt: '2026-08-03T10:00:00.000Z',
        notARealField: 'oops',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('activityCreateSchema (FR-13)', () => {
    const base = {
      tripId: TRIP_ID,
      title: 'Museum visit',
      subtype: 'MUSEUM',
      startAt: '2026-08-05T09:00:00.000Z',
      locationName: 'National Museum',
    };

    // spec-entry-fields-datepickers: same required-locationName override as
    // stayCreateSchema (see its own test's comment).
    it('rejects a missing locationName ("Location name is required")', () => {
      const { locationName: _omit, ...withoutLocationName } = base;
      const result = activityCreateSchema.safeParse(withoutLocationName);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/location name is required/i);
      }
    });

    it('accepts an end datetime equal to the start (point-in-time)', () => {
      const result = activityCreateSchema.safeParse({ ...base, endAt: '2026-08-05T09:00:00.000Z' });
      expect(result.success).toBe(true);
    });

    it('accepts a missing end datetime entirely', () => {
      const result = activityCreateSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it('rejects an end datetime before the start', () => {
      const result = activityCreateSchema.safeParse({ ...base, endAt: '2026-08-05T08:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('rejects an Expense amount without a currency', () => {
      const result = activityCreateSchema.safeParse({ ...base, expenseAmount: 20 });
      expect(result.success).toBe(false);
    });

    // User-reported: "we may plan to visit Big Buddha a certain day, but
    // we should not have to enter a specific time for it" -- a bare
    // `YYYY-MM-DD` startAt (DateTimeInput's timeRequired={false} mode)
    // must parse cleanly, deterministically as UTC midnight (an ECMA-262
    // date-only string is always UTC, unlike a datetime-without-zone
    // string -- see dateTimeField's own comment).
    it('accepts a date-only startAt (no specific time)', () => {
      const result = activityCreateSchema.safeParse({ ...base, startAt: '2026-08-05' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startAt.toISOString()).toBe('2026-08-05T00:00:00.000Z');
      }
    });

    it('rejects a negative Expense amount', () => {
      const result = activityCreateSchema.safeParse({ ...base, expenseAmount: -5, expenseCurrency: 'USD' });
      expect(result.success).toBe(false);
    });

    it('accepts a valid Expense amount/currency pair', () => {
      const result = activityCreateSchema.safeParse({ ...base, expenseAmount: 20, expenseCurrency: 'usd' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.expenseCurrency).toBe('USD');
    });

    // Item 1: `.strict()` must match Note's schema across every type.
    it('rejects an unexpected field (strict schema, matches Note)', () => {
      const result = activityCreateSchema.safeParse({ ...base, notARealField: 'oops' });
      expect(result.success).toBe(false);
    });
  });

  describe('noteCreateSchema (FR-14)', () => {
    const base = { tripId: TRIP_ID, title: 'Bring reef-safe sunscreen', startAt: '2026-08-04T00:00:00.000Z' };

    it('accepts a title and date only', () => {
      const result = noteCreateSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it('rejects a bookingReference field (Note carries none)', () => {
      const result = noteCreateSchema.safeParse({ ...base, bookingReference: 'ABC123' });
      expect(result.success).toBe(false);
    });

    it('rejects Expense fields (Note carries none)', () => {
      const result = noteCreateSchema.safeParse({ ...base, expenseAmount: 10, expenseCurrency: 'USD' });
      expect(result.success).toBe(false);
    });

    it('rejects a Location field (Note carries none)', () => {
      const result = noteCreateSchema.safeParse({ ...base, locationName: 'Somewhere' });
      expect(result.success).toBe(false);
    });

    it('rejects a subtype field (Note has no Entry Subtype)', () => {
      const result = noteCreateSchema.safeParse({ ...base, subtype: 'HOTEL' });
      expect(result.success).toBe(false);
    });

    // Item 5: FR-15's Contact Information capability is shared by every
    // type, Note included -- only booking-reference/Expense (FR-14) are
    // withheld.
    it('accepts Contact fields (FR-15 applies to Note too)', () => {
      const result = noteCreateSchema.safeParse({
        ...base,
        contactName: 'Concierge',
        contactPhone: '+66-2-000-0000',
        contactEmail: 'concierge@example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactName).toBe('Concierge');
        expect(result.data.contactEmail).toBe('concierge@example.com');
      }
    });
  });

  // FR-18, spec-blog: title + content (description) + a required single
  // associated date only -- no subtype/Location/Expense/booking/Contact
  // (Intent: "no location/expense/booking/contact"), narrower even than
  // Note (which keeps Contact per FR-15).
  describe('blogPostCreateSchema (FR-18)', () => {
    const base = { tripId: TRIP_ID, title: 'A journal entry', startAt: '2026-08-05T00:00:00.000Z' };

    it('accepts a title and date only', () => {
      const result = blogPostCreateSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it('accepts title/content/date together', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, description: 'What a day.' });
      expect(result.success).toBe(true);
    });

    // I/O matrix: "Missing date -> 400."
    it('rejects a missing startAt', () => {
      const result = blogPostCreateSchema.safeParse({ tripId: TRIP_ID, title: 'A journal entry' });
      expect(result.success).toBe(false);
    });

    it('rejects a missing title', () => {
      const result = blogPostCreateSchema.safeParse({ tripId: TRIP_ID, startAt: '2026-08-05T00:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('rejects a Location field (Blog Post carries none)', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, locationName: 'Somewhere' });
      expect(result.success).toBe(false);
    });

    it('rejects Expense fields (Blog Post carries none)', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, expenseAmount: 10, expenseCurrency: 'USD' });
      expect(result.success).toBe(false);
    });

    it('rejects a bookingReference field (Blog Post carries none)', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, bookingReference: 'ABC123' });
      expect(result.success).toBe(false);
    });

    it('rejects Contact fields (Blog Post carries none, unlike Note)', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, contactName: 'Someone' });
      expect(result.success).toBe(false);
    });

    it('rejects a subtype field (Blog Post has no Entry Subtype)', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, subtype: 'HOTEL' });
      expect(result.success).toBe(false);
    });

    // spec-guest-access (FR-28): isPrivateField wired into Blog Post too --
    // it is not inert here (unlike ImportantInfo.isPrivate), a Private
    // Published post is excluded from a Guest's Blog list/detail.
    it('accepts an isPrivate flag', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, isPrivate: true });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.isPrivate).toBe(true);
    });

    // AD-10, Boundaries: "published_at is never client-settable through the
    // normal create/edit form" -- `publishedAt` isn't a field on this schema
    // at all, so `.strict()` rejects it exactly like any other unknown key.
    it('rejects a publishedAt field on create (400 via .strict())', () => {
      const result = blogPostCreateSchema.safeParse({ ...base, publishedAt: '2026-08-01T00:00:00.000Z' });
      expect(result.success).toBe(false);
    });
  });

  describe('blogPostUpdateSchema (FR-18/FR-19 boundary)', () => {
    // I/O matrix: "Attempt to set publishedAt via the normal edit form ...
    // 400 if sent as an unrecognized field, per the existing .strict() convention."
    it('rejects a publishedAt field on update (400 via .strict())', () => {
      const result = blogPostUpdateSchema.safeParse({ publishedAt: '2026-08-01T00:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('accepts a partial update to just the title', () => {
      const result = blogPostUpdateSchema.safeParse({ title: 'Renamed' });
      expect(result.success).toBe(true);
    });
  });
});
