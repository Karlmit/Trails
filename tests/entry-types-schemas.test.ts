import { describe, expect, it } from 'vitest';
import { stayCreateSchema, STAY_SUBTYPES } from '@/lib/entry-types/stay.schema';
import { transportCreateSchema } from '@/lib/entry-types/transport.schema';
import { activityCreateSchema } from '@/lib/entry-types/activity.schema';
import { noteCreateSchema } from '@/lib/entry-types/note.schema';

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
    };

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
  });

  describe('transportCreateSchema (FR-12)', () => {
    const base = {
      tripId: TRIP_ID,
      title: 'Flight to Phuket',
      subtype: 'FLIGHT',
      startAt: '2026-08-03T08:00:00.000Z',
    };

    it('rejects arrival not later than departure', () => {
      const result = transportCreateSchema.safeParse({ ...base, endAt: '2026-08-03T08:00:00.000Z' });
      expect(result.success).toBe(false);
    });

    it('accepts a strictly later arrival', () => {
      const result = transportCreateSchema.safeParse({ ...base, endAt: '2026-08-03T10:00:00.000Z' });
      expect(result.success).toBe(true);
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
    };

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
});
