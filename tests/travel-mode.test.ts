import { describe, expect, it } from 'vitest';
import {
  entryMapsUrl,
  findCurrentActivity,
  findCurrentStay,
  findNextByType,
  mapsSearchUrl,
  type TravelModeEntry,
} from '@/lib/travel-mode';

// spec-travel-mode: "unit tests covering the I/O matrix" -- pure, DB-free,
// same split as lib/budget.ts's tests. Entries here are already assumed
// filtered through timelineVisibleEntryWhere() (AD-10), matching the split
// between what the page's Prisma query does and what these functions do.
//
// spec-timeline-ux-and-timezone (correction): an Entry's own startAt/endAt
// are the traveler's literal wall-clock digits, never re-localized through
// the Trip's declared timezone (see dateTimeField's comment) -- only `now`
// (a real moment) is re-projected onto the Trip's own local wall-clock
// digits before being compared against an Entry's field (`tripLocalNow`).
// Passing `timezone: 'UTC'` below makes that re-projection a no-op, so
// those tests exercise pure range-inclusion logic; the dedicated
// "re-projects `now`" tests exercise the projection itself.

function entry(overrides: Partial<TravelModeEntry> & { id: string; entryType: string }): TravelModeEntry {
  return {
    startAt: new Date('2026-08-10T10:00:00.000Z'),
    endAt: null,
    ...overrides,
  };
}

describe('findCurrentStay (I/O matrix: mid-Stay)', () => {
  it('finds a Stay whose startAt..endAt range contains now', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const stay = entry({
      id: 'stay-1',
      entryType: 'STAY',
      startAt: new Date('2026-08-08T15:00:00.000Z'),
      endAt: new Date('2026-08-12T11:00:00.000Z'),
    });
    const other = entry({ id: 'act-1', entryType: 'ACTIVITY', startAt: now });
    expect(findCurrentStay([stay, other], now, 'UTC')?.id).toBe('stay-1');
  });

  it('returns null when no Stay range covers now', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    const stay = entry({
      id: 'stay-1',
      entryType: 'STAY',
      startAt: new Date('2026-08-08T15:00:00.000Z'),
      endAt: new Date('2026-08-12T11:00:00.000Z'),
    });
    expect(findCurrentStay([stay], now, 'UTC')).toBeNull();
  });

  it('is inclusive at both range endpoints', () => {
    const startAt = new Date('2026-08-08T15:00:00.000Z');
    const endAt = new Date('2026-08-12T11:00:00.000Z');
    const stay = entry({ id: 'stay-1', entryType: 'STAY', startAt, endAt });
    expect(findCurrentStay([stay], startAt, 'UTC')?.id).toBe('stay-1');
    expect(findCurrentStay([stay], endAt, 'UTC')?.id).toBe('stay-1');
  });

  it('picks the earliest startAt when more than one Stay range covers now (overlapping bookings)', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const later = entry({
      id: 'stay-later',
      entryType: 'STAY',
      startAt: new Date('2026-08-09T00:00:00.000Z'),
      endAt: new Date('2026-08-15T00:00:00.000Z'),
    });
    const earlier = entry({
      id: 'stay-earlier',
      entryType: 'STAY',
      startAt: new Date('2026-08-05T00:00:00.000Z'),
      endAt: new Date('2026-08-20T00:00:00.000Z'),
    });
    expect(findCurrentStay([later, earlier], now, 'UTC')?.id).toBe('stay-earlier');
  });

  it('ignores non-STAY entries entirely, even if their range covers now', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const transport = entry({
      id: 'transport-1',
      entryType: 'TRANSPORT',
      startAt: new Date('2026-08-10T00:00:00.000Z'),
      endAt: new Date('2026-08-10T23:00:00.000Z'),
    });
    expect(findCurrentStay([transport], now, 'UTC')).toBeNull();
  });

  it("re-projects `now` through the Trip's own timezone before comparing against the Stay's literal range", () => {
    // The Stay's own literal window is 15:00-20:00 (representing 3pm-8pm
    // wherever the traveler is) -- raw UTC `now` (11:00) falls outside that
    // window, but Bangkok's real local time right now (+7 -> 18:00) falls
    // inside it.
    const now = new Date('2026-08-10T11:00:00.000Z');
    const stay = entry({
      id: 'stay-1',
      entryType: 'STAY',
      startAt: new Date('2026-08-10T15:00:00.000Z'),
      endAt: new Date('2026-08-10T20:00:00.000Z'),
    });
    expect(findCurrentStay([stay], now, 'Asia/Bangkok')?.id).toBe('stay-1');
    expect(findCurrentStay([stay], now, 'UTC')).toBeNull();
  });
});

describe('findCurrentActivity (I/O matrix: Activity happening now / point-in-time)', () => {
  it('finds an Activity whose startAt..endAt range contains now', () => {
    const now = new Date('2026-08-10T08:00:00.000Z');
    const activity = entry({
      id: 'act-1',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T07:00:00.000Z'),
      endAt: new Date('2026-08-10T09:00:00.000Z'),
    });
    expect(findCurrentActivity([activity], now, 'UTC')?.id).toBe('act-1');
  });

  it('I/O matrix: point-in-time Activity (endAt null) started earlier today (Trip-local) stays Current for the rest of that day', () => {
    // now = 2026-08-10T10:00:00Z is 2026-08-10 17:00 in Asia/Bangkok
    // (UTC+7): still the same Trip-local calendar day the Activity started
    // on, and after its own 09:00 start.
    const activity = entry({
      id: 'act-morning',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T09:00:00.000Z'),
      endAt: null,
    });
    const now = new Date('2026-08-10T10:00:00.000Z');
    expect(findCurrentActivity([activity], now, 'Asia/Bangkok')?.id).toBe('act-morning');
  });

  it('drops a point-in-time Activity once the calendar day (in the Trip timezone) has passed', () => {
    const activity = entry({
      id: 'act-yesterday',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-09T09:00:00.000Z'), // literal Aug 9
      endAt: null,
    });
    const now = new Date('2026-08-10T10:00:00.000Z'); // Aug 10 in Bangkok
    expect(findCurrentActivity([activity], now, 'Asia/Bangkok')).toBeNull();
  });

  it('does not treat a future point-in-time Activity as current', () => {
    const activity = entry({
      id: 'act-future',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T20:00:00.000Z'),
      endAt: null,
    });
    // now (02:00Z) is 09:00 in Asia/Bangkok -- still before the Activity's
    // own literal 20:00 start.
    const now = new Date('2026-08-10T02:00:00.000Z');
    expect(findCurrentActivity([activity], now, 'Asia/Bangkok')).toBeNull();
  });

  it('is inclusive at both range endpoints (same boundary logic as findCurrentStay)', () => {
    const startAt = new Date('2026-08-10T07:00:00.000Z');
    const endAt = new Date('2026-08-10T09:00:00.000Z');
    const activity = entry({ id: 'act-1', entryType: 'ACTIVITY', startAt, endAt });
    expect(findCurrentActivity([activity], startAt, 'UTC')?.id).toBe('act-1');
    expect(findCurrentActivity([activity], endAt, 'UTC')?.id).toBe('act-1');
  });

  it('picks the earliest startAt when more than one Activity is current', () => {
    const now = new Date('2026-08-10T08:00:00.000Z');
    const later = entry({
      id: 'act-later',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T07:30:00.000Z'),
      endAt: new Date('2026-08-10T09:00:00.000Z'),
    });
    const earlier = entry({
      id: 'act-earlier',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T06:00:00.000Z'),
      endAt: new Date('2026-08-10T09:00:00.000Z'),
    });
    expect(findCurrentActivity([later, earlier], now, 'UTC')?.id).toBe('act-earlier');
  });

  it("re-projects `now` through the Trip's own timezone before comparing against the Activity's literal range", () => {
    const now = new Date('2026-08-10T11:00:00.000Z');
    const activity = entry({
      id: 'act-1',
      entryType: 'ACTIVITY',
      startAt: new Date('2026-08-10T15:00:00.000Z'),
      endAt: new Date('2026-08-10T20:00:00.000Z'),
    });
    expect(findCurrentActivity([activity], now, 'Asia/Bangkok')?.id).toBe('act-1');
    expect(findCurrentActivity([activity], now, 'UTC')).toBeNull();
  });
});

describe('findNextByType (I/O matrix: nothing left today / next per category)', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');
  const entries: TravelModeEntry[] = [
    entry({ id: 'past-stay', entryType: 'STAY', startAt: new Date('2026-08-01T00:00:00.000Z') }),
    entry({ id: 'next-transport', entryType: 'TRANSPORT', startAt: new Date('2026-08-11T09:00:00.000Z') }),
    entry({ id: 'next-activity', entryType: 'ACTIVITY', startAt: new Date('2026-08-10T15:00:00.000Z') }),
    entry({ id: 'later-activity', entryType: 'ACTIVITY', startAt: new Date('2026-08-12T15:00:00.000Z') }),
    entry({ id: 'next-stay', entryType: 'STAY', startAt: new Date('2026-08-20T00:00:00.000Z') }),
  ];

  it('finds the next entry overall (smallest startAt > now, any type)', () => {
    expect(findNextByType(entries, now, 'UTC')?.id).toBe('next-activity');
  });

  it('finds the next entry of a given type independently of the other categories', () => {
    expect(findNextByType(entries, now, 'UTC', 'TRANSPORT')?.id).toBe('next-transport');
    expect(findNextByType(entries, now, 'UTC', 'ACTIVITY')?.id).toBe('next-activity');
    expect(findNextByType(entries, now, 'UTC', 'STAY')?.id).toBe('next-stay');
  });

  it('returns null when there is no future entry of that type (may be tomorrow or later in general, but none at all here)', () => {
    expect(findNextByType(entries, now, 'UTC', 'NOTE')).toBeNull();
  });

  it('excludes an entry exactly at now (must be strictly after)', () => {
    const exact = entry({ id: 'exact-now', entryType: 'ACTIVITY', startAt: now });
    expect(findNextByType([exact], now, 'UTC', 'ACTIVITY')).toBeNull();
  });

  it('may return an entry on a later day (tomorrow or beyond) when nothing remains today', () => {
    const onlyFuture = entries.filter((e) => e.id === 'next-stay');
    const result = findNextByType(onlyFuture, now, 'UTC', 'STAY');
    expect(result?.id).toBe('next-stay');
  });

  it("re-projects `now` through the Trip's own timezone before deciding what's next", () => {
    // Raw UTC `now` (11:00) is before the Activity's literal 15:00 start,
    // but Bangkok's real local time right now (+7 -> 18:00) is already
    // past it -- so under a Bangkok Trip timezone this Activity is no
    // longer "next", while under a UTC Trip timezone it still is.
    const localNow = new Date('2026-08-10T11:00:00.000Z');
    const activity = entry({ id: 'act-1', entryType: 'ACTIVITY', startAt: new Date('2026-08-10T15:00:00.000Z') });
    expect(findNextByType([activity], localNow, 'UTC')?.id).toBe('act-1');
    expect(findNextByType([activity], localNow, 'Asia/Bangkok')).toBeNull();
  });
});

describe('mapsSearchUrl / entryMapsUrl (I/O matrix: Location present on a Current/Next entry)', () => {
  it('builds a Google Maps search URL with the address URL-encoded', () => {
    expect(mapsSearchUrl('123 Main St, Bangkok')).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Bangkok',
    );
  });

  it('prefers locationAddress over locationName', () => {
    const url = entryMapsUrl({ locationAddress: '1 Rue de Rivoli', locationName: 'The Louvre' });
    expect(url).toBe(mapsSearchUrl('1 Rue de Rivoli'));
  });

  it('falls back to locationName when only that is set', () => {
    const url = entryMapsUrl({ locationAddress: null, locationName: 'The Louvre' });
    expect(url).toBe(mapsSearchUrl('The Louvre'));
  });

  it('returns null when neither locationAddress nor locationName is set -- no map link rendered', () => {
    expect(entryMapsUrl({ locationAddress: null, locationName: null })).toBeNull();
  });
});
