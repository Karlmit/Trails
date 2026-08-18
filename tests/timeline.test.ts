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

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries);

    expect(laneCount).toBe(0);
    const day = laidOut.find((d) => d.dateKey === '2026-08-03')!;
    expect(day.lines.map((l) => l.entryId)).toEqual(['a1']);
    expect(day.lines[0].isStart).toBe(true);
    expect(day.lines[0].isEnd).toBe(true);
    expect(day.branches).toHaveLength(0);
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

  // spec-timeline-git-graph: a Stay and a Transport share the exact same
  // branch/lane mechanism now (both are just "a multi-day Entry"), so both
  // simply get their own line and their own branch on whatever day(s)
  // they touch -- including a day they *share*.
  it('gives both a Stay and an overlapping Transport their own line and their own branch on a shared day', () => {
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

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries);

    // Both a Stay and a Transport claim a lane -- neither type is special.
    expect(laneCount).toBe(2);

    const overlapDay = laidOut.find((d) => d.dateKey === '2026-08-04')!;
    expect(overlapDay.lines.map((l) => l.entryId).sort()).toEqual(['s1', 't1']);
    expect(overlapDay.branches.map((b) => b.entryId).sort()).toEqual(['s1', 't1']);
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


// spec-timeline-git-graph: user-directed redesign, modeled on GitKraken's
// own branch/merge graph -- any multi-day Entry (Stay *or* Transport)
// claims a lane and gets a `TimelineBranchSegment` on every day it spans;
// a single-day Entry gets no branch at all, just a dot (via its `lines`
// entry, tested above).
describe('layoutTimelineEntries -- branches (git-graph)', () => {
  function entry(overrides: Partial<EntryForLayout> & Pick<EntryForLayout, 'id' | 'title' | 'startAt'>): EntryForLayout {
    return { entryType: 'STAY', subtype: null, endAt: null, startTimezone: null, endTimezone: null, ...overrides };
  }

  it('gives a single multi-day Entry a start/through/end branch across its own span, lane 0', () => {
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

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries);
    expect(laneCount).toBe(1);

    const at = (dateKey: string) => laidOut.find((d) => d.dateKey === dateKey)!.branches[0];
    expect(at('2026-08-03')).toMatchObject({ entryId: 's1', laneIndex: 0, position: 'start' });
    expect(at('2026-08-04')).toMatchObject({ entryId: 's1', laneIndex: 0, position: 'through' });
    expect(at('2026-08-05')).toMatchObject({ entryId: 's1', laneIndex: 0, position: 'through' });
    expect(at('2026-08-06')).toMatchObject({ entryId: 's1', laneIndex: 0, position: 'end' });
    // No branch at all outside the Entry's own span.
    expect(laidOut.find((d) => d.dateKey === '2026-08-02')!.branches).toHaveLength(0);
    expect(laidOut.find((d) => d.dateKey === '2026-08-07')!.branches).toHaveLength(0);
  });

  it('gives a single-day Entry no branch at all, even though it still gets a line', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [entry({ id: 'a1', entryType: 'ACTIVITY', title: 'Museum', startAt: new Date('2026-08-03T09:00:00.000Z'), endAt: new Date('2026-08-03T09:00:00.000Z') })];

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries);
    expect(laneCount).toBe(0);
    const day = laidOut.find((d) => d.dateKey === '2026-08-03')!;
    expect(day.branches).toHaveLength(0);
    expect(day.lines).toHaveLength(1);
  });

  it('uses one lane for two multi-day Entries that never overlap', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-04T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-06T14:00:00.000Z'), endAt: new Date('2026-08-08T11:00:00.000Z') }),
    ];

    const { laneCount } = layoutTimelineEntries(days, entries);
    expect(laneCount).toBe(1);
  });

  it('still uses two lanes when two multi-day Entries genuinely overlap by a day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-05T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-04T14:00:00.000Z'), endAt: new Date('2026-08-06T11:00:00.000Z') }),
    ];

    const { laneCount, days: laidOut } = layoutTimelineEntries(days, entries);
    expect(laneCount).toBe(2);
    const overlapDay = laidOut.find((d) => d.dateKey === '2026-08-04')!;
    const lanes = new Set(overlapDay.branches.map((b) => b.laneIndex));
    expect(lanes.size).toBe(2);
  });

  // This is the exact user-reported bug: OZO Phuket's own check-out day
  // (2026-11-23) is the same day Thiwson Beach Resort checks in -- both
  // must be visible (via the day's own `lines`, tested above), and now
  // both also get a branch segment on that shared day: OZO's own 'end'
  // (merging into the trunk) and Thiwson's own 'start' (branching back
  // out) -- rendered together, they read as a real git graph's own
  // "merge, then branch" shape, with no special-casing needed anywhere in
  // this function.
  it('gives both Stays a branch segment on their shared check-out/check-in day, same lane', () => {
    const trip = { startDate: dateOnly('2026-11-15'), endDate: dateOnly('2026-11-27') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 'ozo', title: 'OZO Phuket', startAt: new Date('2026-11-18T14:00:00.000Z'), endAt: new Date('2026-11-23T11:00:00.000Z') }),
      entry({ id: 'thiwson', title: 'Thiwson Beach Resort', startAt: new Date('2026-11-23T15:00:00.000Z'), endAt: new Date('2026-11-26T12:00:00.000Z') }),
    ];

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries);
    expect(laneCount).toBe(1); // touching Entries share the one lane

    const sharedDay = laidOut.find((d) => d.dateKey === '2026-11-23')!;
    expect(sharedDay.branches).toHaveLength(2);
    const ozoBranch = sharedDay.branches.find((b) => b.entryId === 'ozo')!;
    const thiwsonBranch = sharedDay.branches.find((b) => b.entryId === 'thiwson')!;
    expect(ozoBranch).toMatchObject({ position: 'end', laneIndex: 0 });
    expect(thiwsonBranch).toMatchObject({ position: 'start', laneIndex: 0 });

    // The day before/after only ever carry the one relevant Entry.
    expect(laidOut.find((d) => d.dateKey === '2026-11-22')!.branches).toEqual([
      { entryId: 'ozo', entryType: 'STAY', laneIndex: 0, position: 'through' },
    ]);
    expect(laidOut.find((d) => d.dateKey === '2026-11-24')!.branches).toEqual([
      { entryId: 'thiwson', entryType: 'STAY', laneIndex: 0, position: 'through' },
    ]);
  });

  it('does not connect two multi-day Entries that are merely adjacent with a real gap day between them', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Hotel A', startAt: new Date('2026-08-02T14:00:00.000Z'), endAt: new Date('2026-08-04T11:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-05T14:00:00.000Z'), endAt: new Date('2026-08-07T11:00:00.000Z') }),
    ];

    const { days: laidOut } = layoutTimelineEntries(days, entries);
    // The gap day itself carries no branch at all.
    expect(laidOut.find((d) => d.dateKey === '2026-08-04')!.branches).toHaveLength(1);
    expect(laidOut.find((d) => d.dateKey === '2026-08-04')!.branches[0].position).toBe('end');
  });

  // Degenerate case: a same-day (check-in === check-out) Stay is a
  // single-day Entry (no branch at all, per the "single-day -> dot" rule
  // above) even when immediately followed by another Stay -- nothing to
  // shorten or special-case, since a single-day Entry never claims a lane.
  it('treats a same-day Stay as single-day (no branch), even when immediately followed by another Stay', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({ id: 's1', title: 'Day-use Hotel', startAt: new Date('2026-08-03T08:00:00.000Z'), endAt: new Date('2026-08-03T20:00:00.000Z') }),
      entry({ id: 's2', title: 'Hotel B', startAt: new Date('2026-08-03T21:00:00.000Z'), endAt: new Date('2026-08-05T11:00:00.000Z') }),
    ];

    expect(() => layoutTimelineEntries(days, entries)).not.toThrow();
    const { days: laidOut } = layoutTimelineEntries(days, entries);
    const day = laidOut.find((d) => d.dateKey === '2026-08-03')!;
    expect(day.branches.map((b) => b.entryId)).toEqual(['s2']);
    expect(day.lines.map((l) => l.entryId).sort()).toEqual(['s1', 's2']);
  });
});
