import { describe, expect, it } from 'vitest';
import { entryOutsideTripRangeError } from '@/lib/entry-types';

// spec-timeline-ux-and-timezone (correction): an Entry's own recorded
// startAt/endAt are literal wall-clock digits, never re-localized through
// the Trip's own declared timezone (see dateTimeField's comment) -- so this
// check compares literal UTC calendar dates on both sides, with no
// timezone involved at all.
describe('entryOutsideTripRangeError', () => {
  const trip = { startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-10T00:00:00.000Z') };

  it('accepts a start/end within the Trip range', () => {
    const result = entryOutsideTripRangeError(
      trip,
      new Date('2026-08-05T15:00:00.000Z'),
      new Date('2026-08-05T18:00:00.000Z'),
    );
    expect(result).toBeNull();
  });

  it('accepts start/end on the Trip range boundary dates', () => {
    expect(entryOutsideTripRangeError(trip, new Date('2026-08-01T23:00:00.000Z'), null)).toBeNull();
    expect(entryOutsideTripRangeError(trip, new Date('2026-08-10T00:30:00.000Z'), null)).toBeNull();
  });

  it('rejects a start date literally outside the Trip range', () => {
    const result = entryOutsideTripRangeError(trip, new Date('2026-07-31T23:00:00.000Z'), null);
    expect(result).toMatch(/Start must fall within/);
  });

  it('rejects an end date literally outside the Trip range', () => {
    const result = entryOutsideTripRangeError(trip, new Date('2026-08-05T00:00:00.000Z'), new Date('2026-08-11T00:00:00.000Z'));
    expect(result).toMatch(/End must fall within/);
  });

  // Correction regression: a late-hour entry (e.g. 23:00) must never be
  // pushed into the next literal calendar day by a timezone conversion --
  // it stays attributed to its own literal date, which here is the Trip's
  // own last day, so it's accepted.
  it('does not push a late-hour entry into the next day via any timezone conversion', () => {
    const result = entryOutsideTripRangeError(trip, new Date('2026-08-10T23:30:00.000Z'), null);
    expect(result).toBeNull();
  });
});
