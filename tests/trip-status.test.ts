import { describe, expect, it } from 'vitest';
import {
  computeTripStatus,
  dateKeyInTimezone,
  entryClockTime,
  entryEndpointClockTime,
  entryEndpointDateKey,
  formatEntryDateTime,
  formatEntryEndpointDateOnly,
  formatEntryEndpointDateTime,
  timezoneDisclosure,
  tripDurationDays,
  tripLocalNow,
  zonedWallClockToUtc,
} from '@/lib/trip-status';

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('computeTripStatus (FR-2, AD-8)', () => {
  const timezone = 'Asia/Bangkok';

  it('is UPCOMING when start date is in the future in the trip timezone', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, now)).toBe('UPCOMING');
  });

  it('is ACTIVE when today falls within the date range in the trip timezone', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, now)).toBe('ACTIVE');
  });

  it('is ACTIVE on the exact start date', () => {
    const now = new Date('2026-08-10T01:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, now)).toBe('ACTIVE');
  });

  it('is ACTIVE on the exact end date', () => {
    const now = new Date('2026-08-20T01:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, now)).toBe('ACTIVE');
  });

  it('is COMPLETED once the end date has passed in the trip timezone', () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, now)).toBe('COMPLETED');
  });

  // User-requested: a manual override so a Trip reads as ACTIVE regardless
  // of what its dates alone would compute.
  it('is ACTIVE when pinnedActive is set, even for a future start date', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone, pinnedActive: true };
    expect(computeTripStatus(trip, now)).toBe('ACTIVE');
  });

  it('is ACTIVE when pinnedActive is set, even for a past end date', () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone, pinnedActive: true };
    expect(computeTripStatus(trip, now)).toBe('ACTIVE');
  });

  it('falls back to date-based Status when pinnedActive is false', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone, pinnedActive: false };
    expect(computeTripStatus(trip, now)).toBe('UPCOMING');
  });

  it('disagrees with a naive UTC-only comparison near a timezone boundary', () => {
    // 2026-08-20T23:30 in Asia/Bangkok (UTC+7) is already 2026-08-21 UTC.
    // A Trip ending 2026-08-20 must read COMPLETED in its own timezone even
    // though the UTC calendar date is still the 20th moments earlier, and
    // must still read ACTIVE right up until the Bangkok day rolls over.
    const stillActive = new Date('2026-08-20T16:59:00.000Z'); // 23:59 Bangkok
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20'), timezone };
    expect(computeTripStatus(trip, stillActive)).toBe('ACTIVE');

    const nowCompleted = new Date('2026-08-20T17:01:00.000Z'); // 00:01 Bangkok next day
    expect(computeTripStatus(trip, nowCompleted)).toBe('COMPLETED');
  });
});

describe('tripDurationDays (§2.3 Trip Duration)', () => {
  it('counts both endpoints inclusive', () => {
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-20') };
    expect(tripDurationDays(trip)).toBe(11);
  });

  it('is 1 for a single-day trip', () => {
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-10') };
    expect(tripDurationDays(trip)).toBe(1);
  });
});

describe('dateKeyInTimezone', () => {
  it('formats as YYYY-MM-DD in the given timezone', () => {
    // 2026-01-01T02:00:00Z is still 2025-12-31 in America/Los_Angeles.
    const key = dateKeyInTimezone(new Date('2026-01-01T02:00:00.000Z'), 'America/Los_Angeles');
    expect(key).toBe('2025-12-31');
  });
});

// spec-timeline-ux-and-timezone: an Entry's own recorded startAt/endAt are
// literal wall-clock digits (see dateTimeField's comment) -- entryClockTime
// reads them back with zero conversion, unlike timeOfDayInTimezone (for
// `now` only).
describe('entryClockTime', () => {
  it("reads an Entry's literal UTC-stored hour/minute with no timezone conversion", () => {
    expect(entryClockTime(new Date('2026-08-05T15:00:00.000Z'))).toEqual({ hour: 15, minute: 0 });
  });
});

describe('formatEntryDateTime', () => {
  it("formats an Entry's own timestamp pinned to UTC, immune to any timezone", () => {
    expect(formatEntryDateTime('2026-08-05T15:00:00.000Z', 'en')).toBe('Aug 5, 2026, 15:00');
  });

  it('accepts a Date object directly, same as a string', () => {
    expect(formatEntryDateTime(new Date('2026-08-05T15:00:00.000Z'), 'en')).toBe('Aug 5, 2026, 15:00');
  });
});

describe('tripLocalNow', () => {
  it("re-projects a real moment onto the Trip's own local wall-clock digits", () => {
    // 09:00 UTC is 16:00 in Asia/Bangkok (UTC+7).
    const localNow = tripLocalNow(new Date('2026-08-05T09:00:00.000Z'), 'Asia/Bangkok');
    expect(localNow.getUTCFullYear()).toBe(2026);
    expect(localNow.getUTCMonth()).toBe(7); // August, 0-indexed
    expect(localNow.getUTCDate()).toBe(5);
    expect(localNow.getUTCHours()).toBe(16);
    expect(localNow.getUTCMinutes()).toBe(0);
  });

  it('is a no-op for a UTC Trip timezone', () => {
    const now = new Date('2026-08-05T09:00:00.000Z');
    expect(tripLocalNow(now, 'UTC').getTime()).toBe(now.getTime());
  });

  it('rolls over to the next calendar day when the offset pushes past midnight', () => {
    // 22:00 UTC is 05:00 the next day in Asia/Bangkok (UTC+7).
    const localNow = tripLocalNow(new Date('2026-08-05T22:00:00.000Z'), 'Asia/Bangkok');
    expect(localNow.getUTCDate()).toBe(6);
    expect(localNow.getUTCHours()).toBe(5);
  });
});

// spec-timeline-ux-and-timezone (correction): the inverse of tripLocalNow --
// used only when a traveler declares a real timezone for one Transport leg.
describe('zonedWallClockToUtc', () => {
  it('is the exact inverse of tripLocalNow', () => {
    const literalDigits = new Date('2026-08-05T15:00:00.000Z');
    const realInstant = zonedWallClockToUtc(literalDigits, 'Asia/Bangkok');
    // Reading the real instant back through the same zone must recover the
    // exact literal digits we started with.
    expect(tripLocalNow(realInstant, 'Asia/Bangkok').getTime()).toBe(literalDigits.getTime());
  });

  it('is a no-op for UTC', () => {
    const literalDigits = new Date('2026-08-05T15:00:00.000Z');
    expect(zonedWallClockToUtc(literalDigits, 'UTC').getTime()).toBe(literalDigits.getTime());
  });

  it('correctly handles a westbound zone where local clock time reads earlier than a naive read', () => {
    // 15:00 literal digits, meant as 15:00 in America/Los_Angeles (UTC-7 in
    // August) -- the real UTC instant is 22:00 the same day.
    const literalDigits = new Date('2026-08-05T15:00:00.000Z');
    const realInstant = zonedWallClockToUtc(literalDigits, 'America/Los_Angeles');
    expect(realInstant.toISOString()).toBe('2026-08-05T22:00:00.000Z');
  });
});

// spec-timeline-ux-and-timezone (correction): the shared zone-or-literal
// resolver every display/day-bucketing call site uses for an Entry's own
// startAt/endAt.
describe('entryEndpointClockTime / entryEndpointDateKey / formatEntryEndpointDateTime', () => {
  it('reads literally when zone is null (every type but an overridden Transport leg)', () => {
    const date = new Date('2026-08-05T15:00:00.000Z');
    expect(entryEndpointClockTime(date, null)).toEqual({ hour: 15, minute: 0 });
    expect(entryEndpointDateKey(date, null)).toBe('2026-08-05');
    expect(formatEntryEndpointDateTime(date, null, 'en')).toBe(formatEntryDateTime(date, 'en'));
  });

  it('converts through the declared zone when non-null', () => {
    // A real UTC instant of 09:00 reads as 16:00 in Asia/Bangkok (+7).
    const date = new Date('2026-08-05T09:00:00.000Z');
    expect(entryEndpointClockTime(date, 'Asia/Bangkok')).toEqual({ hour: 16, minute: 0 });
    expect(entryEndpointDateKey(date, 'Asia/Bangkok')).toBe('2026-08-05');
    expect(formatEntryEndpointDateTime(date, 'Asia/Bangkok', 'en')).toContain('16:00');
  });

  it('a zone conversion can roll the day-key forward relative to the literal UTC date', () => {
    // 22:00 UTC is 05:00 the *next* day in Asia/Bangkok.
    const date = new Date('2026-08-05T22:00:00.000Z');
    expect(entryEndpointDateKey(date, null)).toBe('2026-08-05');
    expect(entryEndpointDateKey(date, 'Asia/Bangkok')).toBe('2026-08-06');
  });
});

// User-reported: a leg's declared timezone is otherwise invisible to a
// viewer who doesn't already know the Trip's own timezone by heart.
describe('timezoneDisclosure', () => {
  it('is empty when zone is null (the default, no-override case)', () => {
    expect(timezoneDisclosure(null, 'Asia/Bangkok')).toBe('');
  });

  it('is empty when zone matches the Trip timezone exactly', () => {
    expect(timezoneDisclosure('Asia/Bangkok', 'Asia/Bangkok')).toBe('');
  });

  it('discloses the zone in parens when it differs from the Trip timezone', () => {
    expect(timezoneDisclosure('Asia/Tokyo', 'Asia/Bangkok')).toBe(' (Asia/Tokyo)');
  });
});

describe('formatEntryEndpointDateOnly', () => {
  it('formats just the date, no clock time, with zero conversion when zone is null', () => {
    expect(formatEntryEndpointDateOnly(new Date('2026-08-05T15:00:00.000Z'), null, 'en')).toBe('Aug 5, 2026');
  });

  it('formats through the declared zone when non-null', () => {
    // 22:00 UTC is Aug 6 in Asia/Bangkok (+7).
    expect(formatEntryEndpointDateOnly(new Date('2026-08-05T22:00:00.000Z'), 'Asia/Bangkok', 'en')).toBe('Aug 6, 2026');
  });
});
