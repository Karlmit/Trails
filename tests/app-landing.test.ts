import { describe, expect, it } from 'vitest';
import { decideLandingTrip, type LandingTrip } from '@/lib/app-landing';

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function trip(id: string, startDate: string, endDate: string, timezone = 'UTC'): LandingTrip {
  return { id, startDate: dateOnly(startDate), endDate: dateOnly(endDate), timezone };
}

// FR-7: app-level landing decision -- Active Trip's Timeline; else nearest
// Upcoming; else most recent Completed; else no Trip (caller falls back to
// /trips).
describe('decideLandingTrip (FR-7)', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('returns null when there are no Trips at all', () => {
    expect(decideLandingTrip([], now)).toEqual({ tripId: null });
  });

  it('lands on the Active Trip when one exists', () => {
    const active = trip('active', '2026-08-10', '2026-08-20');
    const upcoming = trip('upcoming', '2026-09-01', '2026-09-10');
    const completed = trip('completed', '2026-01-01', '2026-01-10');

    expect(decideLandingTrip([upcoming, completed, active], now)).toEqual({ tripId: 'active' });
  });

  it('falls back to the nearest-starting Upcoming Trip when no Trip is Active', () => {
    const far = trip('far', '2026-10-01', '2026-10-10');
    const near = trip('near', '2026-09-01', '2026-09-10');
    const completed = trip('completed', '2026-01-01', '2026-01-10');

    expect(decideLandingTrip([far, completed, near], now)).toEqual({ tripId: 'near' });
  });

  it('falls back to the most-recently-ended Completed Trip when no Trip is Active or Upcoming', () => {
    const older = trip('older', '2026-01-01', '2026-01-10');
    const recent = trip('recent', '2026-07-01', '2026-07-10');

    expect(decideLandingTrip([older, recent], now)).toEqual({ tripId: 'recent' });
  });

  // Item 8: without a deterministic tie-break, two Trips with the same
  // status/date would land on whichever the input happened to list first.
  it('deterministically tie-breaks two simultaneously-Active Trips by id', () => {
    const a = trip('bbbbbbbb-0000-4000-8000-000000000000', '2026-08-10', '2026-08-20');
    const b = trip('aaaaaaaa-0000-4000-8000-000000000000', '2026-08-10', '2026-08-20');

    expect(decideLandingTrip([a, b], now)).toEqual({ tripId: 'aaaaaaaa-0000-4000-8000-000000000000' });
    expect(decideLandingTrip([b, a], now)).toEqual({ tripId: 'aaaaaaaa-0000-4000-8000-000000000000' });
  });

  it('deterministically tie-breaks two Upcoming Trips starting on the same date by id', () => {
    const a = trip('bbbbbbbb-0000-4000-8000-000000000000', '2026-09-01', '2026-09-10');
    const b = trip('aaaaaaaa-0000-4000-8000-000000000000', '2026-09-01', '2026-09-10');

    expect(decideLandingTrip([a, b], now)).toEqual({ tripId: 'aaaaaaaa-0000-4000-8000-000000000000' });
    expect(decideLandingTrip([b, a], now)).toEqual({ tripId: 'aaaaaaaa-0000-4000-8000-000000000000' });
  });
});
