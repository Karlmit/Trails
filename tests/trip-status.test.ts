import { describe, expect, it } from 'vitest';
import { computeTripStatus, dateKeyInTimezone, tripDurationDays } from '@/lib/trip-status';

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
