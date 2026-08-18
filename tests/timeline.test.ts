import { describe, expect, it } from 'vitest';
import { buildTimelineDays, layoutTimelineEntries, type EntryForLayout } from '@/lib/timeline';
import { timelineVisibleEntryWhere } from '@/lib/entry-types';

// AD-10, spec-blog: the shared Prisma `where` predicate both the Timeline
// Server Component and GET /api/v1/timeline-entries use -- unit-tested here
// against Prisma's actual query engine (via an in-memory-shaped filter) is
// out of scope for a pure unit test, so this just locks down the predicate's
// *shape*, which is what both read paths actually depend on; the
// behavioral guarantee itself (a Draft never appears, a Published one does)
// is covered end-to-end in
// tests/integration/timeline-entries-route.test.ts and
// tests/integration/timeline-entries-publish-route.test.ts.
describe('timelineVisibleEntryWhere (AD-10)', () => {
  it('unconditionally includes Stay/Transport/Activity/Note, and only a Published BlogPost', () => {
    const where = timelineVisibleEntryWhere();
    expect(where.OR).toEqual([
      { entryType: { in: ['STAY', 'TRANSPORT', 'ACTIVITY', 'NOTE'] } },
      { entryType: 'BLOG_POST', publishedAt: { not: null } },
    ]);
  });
});

function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('buildTimelineDays (FR-8)', () => {
  it('produces one row per calendar day inclusive of both endpoints', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-03') };
    const days = buildTimelineDays(trip, []);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('keeps days with no Section coverage visible, with sectionIndex null', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const sections = [{ startDate: dateOnly('2026-08-03'), endDate: dateOnly('2026-08-04') }];
    const days = buildTimelineDays(trip, sections);

    expect(days.find((d) => d.dateKey === '2026-08-01')?.sectionIndex).toBeNull();
    expect(days.find((d) => d.dateKey === '2026-08-03')?.sectionIndex).toBe(0);
    expect(days.find((d) => d.dateKey === '2026-08-04')?.sectionIndex).toBe(0);
    expect(days.find((d) => d.dateKey === '2026-08-05')?.sectionIndex).toBeNull();
  });

  it('assigns a shared boundary day to a Section band (touching endpoints, FR-5)', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const sections = [
      { startDate: dateOnly('2026-08-03'), endDate: dateOnly('2026-08-07') },
      { startDate: dateOnly('2026-08-07'), endDate: dateOnly('2026-08-10') },
    ];
    const days = buildTimelineDays(trip, sections);
    const boundaryDay = days.find((d) => d.dateKey === '2026-08-07');
    expect(boundaryDay?.sectionIndex).not.toBeNull();
  });

  // FR-9/FR-10: the current-position marker and auto-scroll target both key
  // off `isToday` on the day the caller identifies as "today" (an Active
  // Trip only -- see dateKeyInTimezone/computeTripStatus in trip-status.ts).
  it('flags exactly the caller-provided todayKey as isToday, and no other day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, [], '2026-08-03');

    expect(days.find((d) => d.dateKey === '2026-08-03')?.isToday).toBe(true);
    expect(days.filter((d) => d.isToday).map((d) => d.dateKey)).toEqual(['2026-08-03']);
  });

  it('flags no day as isToday when todayKey is null (non-Active Trip)', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);

    expect(days.every((d) => d.isToday === false)).toBe(true);
  });

  it('flags no day as isToday when todayKey falls outside the Trip range', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, [], '2026-09-01');

    expect(days.every((d) => d.isToday === false)).toBe(true);
  });

  // Item 4: an inverted range must never silently render as zero days --
  // both Trip schemas reject this at the API boundary, but the defensive
  // check here must still fire loudly if that boundary is ever bypassed.
  it('throws instead of silently rendering zero days when endDate precedes startDate', () => {
    const trip = { startDate: dateOnly('2026-08-10'), endDate: dateOnly('2026-08-01') };
    expect(() => buildTimelineDays(trip, [])).toThrow(/endDate.*precedes.*startDate/i);
  });
});

// spec-timeline-visual-redesign: every Entry touching a day gets its own
// line there, always -- a plain per-day array, never a lane-indexed "slot"
// that a later entry could silently overwrite (the user-reported bug: a
// Stay's own check-out day, or a Transport's own arrival day, disappearing
// whenever another Entry happened to touch the same day).
describe('layoutTimelineEntries -- per-day lines (no data loss on a shared day)', () => {
  function entry(overrides: Partial<EntryForLayout> & Pick<EntryForLayout, 'id' | 'title' | 'startAt'>): EntryForLayout {
    return { entryType: 'ACTIVITY', subtype: null, endAt: null, startTimezone: null, endTimezone: null, ...overrides };
  }

  it('renders a single-day entry (no endAt) as one line, isStart and isEnd both true', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [entry({ id: 'a1', title: 'Boat tour', startAt: new Date('2026-08-03T09:00:00.000Z') })];

    const { days: laidOut, stayRibbons } = layoutTimelineEntries(days, entries);

    expect(stayRibbons).toHaveLength(0);
    const day = laidOut.find((d) => d.dateKey === '2026-08-03')!;
    expect(day.lines.map((l) => l.entryId)).toEqual(['a1']);
    expect(day.lines[0].isStart).toBe(true);
    expect(day.lines[0].isEnd).toBe(true);
  });

  it('carries startAt/startTimezone through onto a single-day line', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const startAt = new Date('2026-08-03T09:00:00.000Z');
    const entries = [
      entry({ id: 's1', entryType: 'STAY', title: 'Day-use Hotel', startAt, endAt: startAt, startTimezone: 'Asia/Bangkok' }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    const line = laidOut.find((d) => d.dateKey === '2026-08-03')!.lines[0];
    expect(line.startAt).toEqual(startAt);
    expect(line.startTimezone).toBe('Asia/Bangkok');
  });

  it('renders an entry whose end equals its start as one line (Activity point-in-time)', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'a1',
        title: 'Sunset viewpoint',
        startAt: new Date('2026-08-03T18:00:00.000Z'),
        endAt: new Date('2026-08-03T18:00:00.000Z'),
      }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.lines).toHaveLength(1);
  });

  it('gives a multi-night Stay one line per day it spans, isStart only on the first, isEnd only on the last', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        entryType: 'STAY',
        title: 'Beach Resort',
        startAt: new Date('2026-08-03T14:00:00.000Z'),
        endAt: new Date('2026-08-06T11:00:00.000Z'),
      }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);

    const spanned = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
    for (const dateKey of spanned) {
      const day = laidOut.find((d) => d.dateKey === dateKey)!;
      expect(day.lines.map((l) => l.entryId)).toEqual(['s1']);
    }
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.lines[0].isStart).toBe(true);
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.lines[0].isEnd).toBe(false);
    expect(laidOut.find((d) => d.dateKey === '2026-08-06')!.lines[0].isEnd).toBe(true);
    expect(laidOut.find((d) => d.dateKey === '2026-08-06')!.lines[0].isStart).toBe(false);
    // A day outside the Stay's span has no line for it at all.
    expect(laidOut.find((d) => d.dateKey === '2026-08-02')!.lines).toHaveLength(0);
  });

  it('carries the entry startAt/endAt through onto every line, unchanged across start/middle/end days', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const startAt = new Date('2026-08-03T14:00:00.000Z');
    const endAt = new Date('2026-08-06T11:00:00.000Z');
    const entries = [entry({ id: 's1', entryType: 'STAY', title: 'Beach Resort', startAt, endAt })];

    const { days: laidOut } = layoutTimelineEntries(days, entries);

    const startDay = laidOut.find((d) => d.dateKey === '2026-08-03')!.lines[0];
    const middleDay = laidOut.find((d) => d.dateKey === '2026-08-04')!.lines[0];
    const endDay = laidOut.find((d) => d.dateKey === '2026-08-06')!.lines[0];

    for (const line of [startDay, middleDay, endDay]) {
      expect(line.startAt).toEqual(startAt);
      expect(line.endAt).toEqual(endAt);
    }
  });

  // spec-timeline-visual-redesign: Transport never competes with a Stay for
  // lane space (it has none), so both simply get their own line on
  // whatever day(s) they touch -- including a day they *share*.
  it('gives both a Stay and an overlapping Transport their own line on a shared day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        entryType: 'STAY',
        title: 'Hotel A',
        startAt: new Date('2026-08-02T14:00:00.000Z'),
        endAt: new Date('2026-08-06T11:00:00.000Z'),
      }),
      entry({
        id: 't1',
        entryType: 'TRANSPORT',
        title: 'Rental car',
        startAt: new Date('2026-08-04T09:00:00.000Z'),
        endAt: new Date('2026-08-08T09:00:00.000Z'),
      }),
    ];

    const { days: laidOut, stayRibbons } = layoutTimelineEntries(days, entries);

    // Only the Stay gets a ribbon -- Transport never does.
    expect(stayRibbons).toHaveLength(1);
    expect(stayRibbons[0].entryId).toBe('s1');

    const overlapDay = laidOut.find((d) => d.dateKey === '2026-08-04')!;
    expect(overlapDay.lines.map((l) => l.entryId).sort()).toEqual(['s1', 't1']);
  });

  // spec-timeline-ux-and-timezone (correction): an Entry's own startAt/endAt
  // are the traveler's literal wall-clock digits, never re-localized
  // through the Trip's declared timezone (see dateTimeField's comment) --
  // so single-day-vs-multi-day is decided from the literal UTC calendar
  // date alone, with no Trip timezone involved at all.
  it("decides single-day vs. multi-day from the entry's own literal date, not any timezone conversion", () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'a1',
        title: 'Late arrival check',
        startAt: new Date('2026-08-03T23:00:00.000Z'),
        endAt: new Date('2026-08-03T23:30:00.000Z'),
      }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.lines.map((l) => l.entryId)).toEqual(['a1']);
    expect(laidOut.find((d) => d.dateKey === '2026-08-04')!.lines).toHaveLength(0);
  });

  // spec-timeline-ux-and-timezone (correction): a Transport leg's own
  // declared timezone (startTimezone/endTimezone) is the one exception --
  // its real UTC instant is converted through that zone for day-bucketing,
  // unlike every naive (zone: null) entry above.
  it("buckets a Transport leg by its own declared timezone's calendar date, not the literal UTC date", () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'flight-1',
        entryType: 'TRANSPORT',
        title: 'Overnight flight',
        // Real instant 22:00 UTC on Aug 3 -- Asia/Bangkok (+7) reads it as
        // 05:00 Aug 4.
        startAt: new Date('2026-08-03T22:00:00.000Z'),
        endAt: new Date('2026-08-03T22:30:00.000Z'),
        startTimezone: 'Asia/Bangkok',
        endTimezone: 'Asia/Bangkok',
      }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.lines).toHaveLength(0);
    expect(laidOut.find((d) => d.dateKey === '2026-08-04')!.lines.map((l) => l.entryId)).toEqual(['flight-1']);
  });

  it('drops an entry dated entirely outside the Trip range rather than crashing', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [entry({ id: 'x1', title: 'Out of range', startAt: new Date('2026-09-01T00:00:00.000Z') })];

    expect(() => layoutTimelineEntries(days, entries)).not.toThrow();
    const { days: laidOut } = layoutTimelineEntries(days, entries);
    expect(laidOut.every((d) => d.lines.length === 0)).toBe(true);
  });

  // The exact user-reported scenario: a flight arriving the day OZO Phuket
  // checks in must never lose either line.
  it('gives a Transport arrival and an unrelated Stay check-in their own lines on the same shared day', () => {
    const trip = { startDate: dateOnly('2026-11-15'), endDate: dateOnly('2026-11-25') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'flight-1',
        entryType: 'TRANSPORT',
        title: 'Got to Phuket',
        startAt: new Date('2026-11-17T10:00:00.000Z'),
        endAt: new Date('2026-11-18T02:00:00.000Z'),
      }),
      entry({
        id: 'ozo',
        entryType: 'STAY',
        title: 'OZO Phuket',
        startAt: new Date('2026-11-18T14:00:00.000Z'),
        endAt: new Date('2026-11-23T11:00:00.000Z'),
      }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    const sharedDay = laidOut.find((d) => d.dateKey === '2026-11-18')!;
    const ids = sharedDay.lines.map((l) => l.entryId).sort();
    expect(ids).toEqual(['flight-1', 'ozo']);
    expect(sharedDay.lines.find((l) => l.entryId === 'flight-1')!.isEnd).toBe(true);
    expect(sharedDay.lines.find((l) => l.entryId === 'ozo')!.isStart).toBe(true);
  });
});

describe('layoutTimelineEntries -- Stay ribbons', () => {
  function entry(overrides: Partial<EntryForLayout> & Pick<EntryForLayout, 'id' | 'title' | 'startAt'>): EntryForLayout {
    return { entryType: 'STAY', subtype: null, endAt: null, startTimezone: null, endTimezone: null, ...overrides };
  }

  it('spans a single Stay from its check-in day index to its check-out day index, lane 0', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        title: 'Beach Resort',
        startAt: new Date('2026-08-03T14:00:00.000Z'),
        endAt: new Date('2026-08-06T11:00:00.000Z'),
      }),
    ];

    const { stayRibbons } = layoutTimelineEntries(days, entries);
    expect(stayRibbons).toHaveLength(1);
    expect(stayRibbons[0]).toMatchObject({ entryId: 's1', startDayIndex: 2, endDayIndex: 5, laneIndex: 0, colorIndex: 0 });
  });

  it('alternates colorIndex by chronological order among Stays, even with a gap between them', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-20') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-04T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-10T14:00:00.000Z'), endAt: new Date('2026-08-12T11:00:00.000Z') }),
    ];

    const { stayRibbons } = layoutTimelineEntries(days, entries);
    expect(stayRibbons.find((r) => r.entryId === 's1')?.colorIndex).toBe(0);
    expect(stayRibbons.find((r) => r.entryId === 's2')?.colorIndex).toBe(1);
  });

  it('uses one lane for two Stays that never overlap', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-04T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-06T14:00:00.000Z'), endAt: new Date('2026-08-08T11:00:00.000Z') }),
    ];

    const { stayLaneCount } = layoutTimelineEntries(days, entries);
    expect(stayLaneCount).toBe(1);
  });

  it('still uses two lanes when two Stays genuinely overlap by a day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-05T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-04T14:00:00.000Z'), endAt: new Date('2026-08-06T11:00:00.000Z') }),
    ];

    const { stayLaneCount, stayRibbons } = layoutTimelineEntries(days, entries);
    expect(stayLaneCount).toBe(2);
    const lanes = new Set(stayRibbons.map((r) => r.laneIndex));
    expect(lanes.size).toBe(2);
  });

  // This is the exact user-reported bug: OZO Phuket's own check-out day
  // (2026-11-23) is the same day Thiwson Beach Resort checks in -- both
  // must be visible (via the day's own `lines`, checked above), and the
  // ribbon system must record this as a clean handoff, not overlap or
  // silently drop one Stay's ribbon.
  it('shortens the outgoing ribbon by one day and records a handoff when two Stays touch', () => {
    const trip = { startDate: dateOnly('2026-11-15'), endDate: dateOnly('2026-11-27') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'ozo',
        title: 'OZO Phuket',
        startAt: new Date('2026-11-18T14:00:00.000Z'),
        endAt: new Date('2026-11-23T11:00:00.000Z'),
      }),
      entry({
        id: 'thiwson',
        title: 'Thiwson Beach Resort',
        startAt: new Date('2026-11-23T15:00:00.000Z'),
        endAt: new Date('2026-11-26T12:00:00.000Z'),
      }),
    ];

    const { stayRibbons, stayHandoffs, stayLaneCount } = layoutTimelineEntries(days, entries);

    // Both touching Stays share the one lane (the whole point of the
    // touching-reuse convention).
    expect(stayLaneCount).toBe(1);

    const ozoDayIndex = days.findIndex((d) => d.dateKey === '2026-11-18');
    const checkoutDayIndex = days.findIndex((d) => d.dateKey === '2026-11-23');
    const thiwsonEndIndex = days.findIndex((d) => d.dateKey === '2026-11-26');

    const ozoRibbon = stayRibbons.find((r) => r.entryId === 'ozo')!;
    // Shortened by one day -- ends the day *before* the shared check-out/
    // check-in day, not on it.
    expect(ozoRibbon.startDayIndex).toBe(ozoDayIndex);
    expect(ozoRibbon.endDayIndex).toBe(checkoutDayIndex - 1);
    expect(ozoRibbon.truncatedForHandoff).toBe(true);

    const thiwsonRibbon = stayRibbons.find((r) => r.entryId === 'thiwson')!;
    expect(thiwsonRibbon.startDayIndex).toBe(checkoutDayIndex);
    expect(thiwsonRibbon.endDayIndex).toBe(thiwsonEndIndex);
    expect(thiwsonRibbon.truncatedForHandoff).toBe(false);

    expect(stayHandoffs).toHaveLength(1);
    expect(stayHandoffs[0]).toMatchObject({
      dayIndex: checkoutDayIndex,
      laneIndex: 0,
      outgoingEntryId: 'ozo',
      incomingEntryId: 'thiwson',
    });
    // The two touching Stays alternate color, so the handoff marker's two
    // halves are always visually distinguishable.
    expect(stayHandoffs[0].outgoingColorIndex).not.toBe(stayHandoffs[0].incomingColorIndex);
  });

  it('does not record a handoff for two Stays that are merely adjacent with a real gap day between them', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-04T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-05T14:00:00.000Z'), endAt: new Date('2026-08-07T11:00:00.000Z') }),
    ];

    const { stayHandoffs } = layoutTimelineEntries(days, entries);
    expect(stayHandoffs).toHaveLength(0);
  });

  // Regression: colorIndex must alternate against *this lane's own*
  // previous occupant, not a global running count -- an unrelated Stay
  // that briefly claims a second lane (a genuine overlap elsewhere on the
  // Trip) must never shift the parity of a real touching handoff
  // elsewhere, or its two ribbons could end up the same color, making the
  // handoff marker invisible (both halves identical).
  it('keeps a real handoff two-toned even when an unrelated overlapping Stay claims a second lane in between', () => {
    const trip = { startDate: dateOnly('2026-11-15'), endDate: dateOnly('2026-11-30') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 'ozo', title: 'OZO Phuket', startAt: new Date('2026-11-18T14:00:00.000Z'), endAt: new Date('2026-11-23T11:00:00.000Z') }),
      // Genuinely overlaps OZO by a day -- forced into a second lane,
      // between OZO and Thiwson in start order.
      entry({ id: 'overlap', title: 'Overlap Hotel', startAt: new Date('2026-11-20T12:00:00.000Z'), endAt: new Date('2026-11-21T12:00:00.000Z') }),
      entry({ id: 'thiwson', title: 'Thiwson Beach Resort', startAt: new Date('2026-11-23T15:00:00.000Z'), endAt: new Date('2026-11-26T12:00:00.000Z') }),
    ];

    const { stayHandoffs } = layoutTimelineEntries(days, entries);
    const handoff = stayHandoffs.find((h) => h.outgoingEntryId === 'ozo' && h.incomingEntryId === 'thiwson');
    expect(handoff).toBeDefined();
    expect(handoff!.outgoingColorIndex).not.toBe(handoff!.incomingColorIndex);
  });

  // Degenerate case: a same-day (check-in === check-out) Stay immediately
  // followed by another must not crash or invert the ribbon's range.
  it('does not shorten a same-day Stay ribbon below its own single day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Day-use Hotel', startAt: new Date('2026-08-03T08:00:00.000Z'), endAt: new Date('2026-08-03T20:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-03T21:00:00.000Z'), endAt: new Date('2026-08-05T11:00:00.000Z') }),
    ];

    expect(() => layoutTimelineEntries(days, entries)).not.toThrow();
    const { stayRibbons } = layoutTimelineEntries(days, entries);
    const s1 = stayRibbons.find((r) => r.entryId === 's1')!;
    expect(s1.startDayIndex).toBeLessThanOrEqual(s1.endDayIndex);
  });
});
