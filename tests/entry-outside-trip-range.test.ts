import { describe, expect, it } from 'vitest';
import {
  applyEntryLegTimezones,
  applyEntryLegTimezonesForUpdate,
  entryOutsideTripRangeError,
  type ParsedEntryFields,
} from '@/lib/entry-types';

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

  // spec-timeline-ux-and-timezone (correction): a Transport leg's own
  // declared timezone is used for its own range check -- these two cases
  // are only distinguishable *with* the zone applied, isolating that the
  // zone parameter (not just the literal UTC date) drives the result.
  it('accepts a real instant whose literal UTC date falls outside range but whose declared-zone date falls inside', () => {
    // Real instant 2026-08-11T02:00Z: literal UTC date is Aug 11 (outside
    // the Trip's Aug 1-10 range), but America/Los_Angeles (UTC-7 in August)
    // reads it as Aug 10 (inside range).
    const result = entryOutsideTripRangeError(trip, new Date('2026-08-11T02:00:00.000Z'), null, 'America/Los_Angeles');
    expect(result).toBeNull();
  });

  it('rejects a real instant whose literal UTC date falls inside range but whose declared-zone date falls outside', () => {
    // Real instant 2026-08-10T20:00Z: literal UTC date is Aug 10 (inside
    // range), but Asia/Tokyo (UTC+9) reads it as Aug 11 (outside range).
    const result = entryOutsideTripRangeError(trip, new Date('2026-08-10T20:00:00.000Z'), null, 'Asia/Tokyo');
    expect(result).toMatch(/Start must fall within/);
  });
});

describe('applyEntryLegTimezones (POST)', () => {
  it('is a no-op for every entry type but TRANSPORT', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T15:00:00.000Z'),
      startTimezone: 'Asia/Bangkok',
    };
    const error = applyEntryLegTimezones('STAY', parsed);
    expect(error).toBeNull();
    expect(parsed.startAt).toEqual(new Date('2026-08-05T15:00:00.000Z'));
  });

  it('leaves a Transport untouched when neither leg declares a timezone', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T15:00:00.000Z'),
      endAt: new Date('2026-08-05T18:00:00.000Z'),
    };
    const error = applyEntryLegTimezones('TRANSPORT', parsed);
    expect(error).toBeNull();
    expect(parsed.startAt).toEqual(new Date('2026-08-05T15:00:00.000Z'));
    expect(parsed.endAt).toEqual(new Date('2026-08-05T18:00:00.000Z'));
  });

  it('recomputes startAt/endAt into real UTC instants when a leg declares a timezone', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T23:00:00.000Z'), // literal 23:00
      startTimezone: 'Asia/Bangkok', // UTC+7 -> real instant is 16:00 UTC
      endAt: new Date('2026-08-05T15:00:00.000Z'), // literal 15:00
      endTimezone: 'America/Los_Angeles', // UTC-7 (Aug) -> real instant is 22:00 UTC
    };
    const error = applyEntryLegTimezones('TRANSPORT', parsed);
    expect(error).toBeNull();
    expect(parsed.startAt).toEqual(new Date('2026-08-05T16:00:00.000Z'));
    expect(parsed.endAt).toEqual(new Date('2026-08-05T22:00:00.000Z'));
  });

  // This is the exact scenario the user reported: a long-haul flight whose
  // arrival *local clock time* reads earlier than its departure's -- a
  // naive same-schema comparison would wrongly reject it, but the real
  // instants (once each leg's own zone is applied) are correctly ordered.
  it('accepts a flight whose arrival literal clock time reads earlier than departure, once real zones are applied', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T18:00:00.000Z'), // literal 18:00, Tokyo departure
      startTimezone: 'Asia/Tokyo', // UTC+9 -> real instant 09:00 UTC
      endAt: new Date('2026-08-05T12:00:00.000Z'), // literal 12:00, same literal day, LA arrival
      endTimezone: 'America/Los_Angeles', // UTC-7 (Aug) -> real instant 19:00 UTC
    };
    const error = applyEntryLegTimezones('TRANSPORT', parsed);
    // Real order: depart 09:00 UTC, arrive 19:00 UTC -- a normal ~10h flight.
    expect(error).toBeNull();
    expect((parsed.endAt as Date).getTime()).toBeGreaterThan((parsed.startAt as Date).getTime());
  });

  it('still rejects a genuinely-invalid pair once real instants are computed', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T15:00:00.000Z'),
      startTimezone: 'UTC',
      endAt: new Date('2026-08-05T10:00:00.000Z'),
      endTimezone: 'UTC',
    };
    const error = applyEntryLegTimezones('TRANSPORT', parsed);
    expect(error).toMatch(/Arrival must be later than departure/);
  });
});

describe('applyEntryLegTimezonesForUpdate (PATCH)', () => {
  it('is a no-op for every entry type but TRANSPORT', () => {
    const parsed: ParsedEntryFields = { startAt: new Date('2026-08-05T15:00:00.000Z'), startTimezone: 'Asia/Bangkok' };
    applyEntryLegTimezonesForUpdate('ACTIVITY', parsed);
    expect(parsed.startAt).toEqual(new Date('2026-08-05T15:00:00.000Z'));
  });

  it('recomputes only the endpoint whose datetime and zone were both resubmitted', () => {
    const parsed: ParsedEntryFields = {
      startAt: new Date('2026-08-05T23:00:00.000Z'),
      startTimezone: 'Asia/Bangkok',
      // endAt/endTimezone omitted entirely -- untouched by this PATCH.
    };
    applyEntryLegTimezonesForUpdate('TRANSPORT', parsed);
    expect(parsed.startAt).toEqual(new Date('2026-08-05T16:00:00.000Z'));
    expect(parsed.endAt).toBeUndefined();
  });

  it('does not recompute a zone-only field with no corresponding datetime in this PATCH', () => {
    const parsed: ParsedEntryFields = { startTimezone: 'Asia/Bangkok' };
    applyEntryLegTimezonesForUpdate('TRANSPORT', parsed);
    expect(parsed.startAt).toBeUndefined();
  });
});
