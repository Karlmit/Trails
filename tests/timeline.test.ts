import { describe, expect, it } from 'vitest';
import { buildTimelineDays, layoutTimelineEntries, type EntryForLayout } from '@/lib/timeline';

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

  // spec-timeline-ux-and-timezone: graph-column rail connectivity is
  // derived purely from neighboring days' sectionIndex -- continuous only
  // when both sides share the same non-null Section.
  describe('rail connectivity (connectsAbove/connectsBelow)', () => {
    it('connects two adjacent days that share the same Section', () => {
      const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-03') };
      const sections = [{ startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-03') }];
      const days = buildTimelineDays(trip, sections);

      const first = days.find((d) => d.dateKey === '2026-08-01')!;
      const middle = days.find((d) => d.dateKey === '2026-08-02')!;
      const last = days.find((d) => d.dateKey === '2026-08-03')!;

      expect(first.connectsAbove).toBe(false); // no day before the range
      expect(first.connectsBelow).toBe(true);
      expect(middle.connectsAbove).toBe(true);
      expect(middle.connectsBelow).toBe(true);
      expect(last.connectsAbove).toBe(true);
      expect(last.connectsBelow).toBe(false); // no day after the range
    });

    it('does not connect across a gap day (no Section on one or both sides)', () => {
      const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-03') };
      const sections = [{ startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-01') }];
      const days = buildTimelineDays(trip, sections);

      const sectionDay = days.find((d) => d.dateKey === '2026-08-01')!;
      const gapDay = days.find((d) => d.dateKey === '2026-08-02')!;
      const anotherGapDay = days.find((d) => d.dateKey === '2026-08-03')!;

      expect(sectionDay.connectsBelow).toBe(false);
      expect(gapDay.connectsAbove).toBe(false);
      expect(gapDay.connectsBelow).toBe(false);
      expect(anotherGapDay.connectsAbove).toBe(false);
    });

    it('does not connect across a Section boundary (two different Sections, touching endpoints)', () => {
      const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
      const sections = [
        { startDate: dateOnly('2026-08-03'), endDate: dateOnly('2026-08-07') },
        { startDate: dateOnly('2026-08-07'), endDate: dateOnly('2026-08-10') },
      ];
      const days = buildTimelineDays(trip, sections);

      const withinFirst = days.find((d) => d.dateKey === '2026-08-05')!;
      const boundaryDay = days.find((d) => d.dateKey === '2026-08-07')!; // belongs to section 0 (FR-5)
      const afterBoundary = days.find((d) => d.dateKey === '2026-08-08')!; // belongs to section 1

      expect(withinFirst.connectsAbove).toBe(true);
      expect(withinFirst.connectsBelow).toBe(true);
      // The boundary day is attributed to section 0, but its neighbor
      // (2026-08-08) belongs to section 1 -- different sectionIndex, so no
      // connection renders across the boundary.
      expect(boundaryDay.sectionIndex).toBe(0);
      expect(boundaryDay.connectsAbove).toBe(true);
      expect(boundaryDay.connectsBelow).toBe(false);
      expect(afterBoundary.sectionIndex).toBe(1);
      expect(afterBoundary.connectsAbove).toBe(false);
    });
  });
});

// spec-timeline-entries: FR-11..FR-15 rendering -- single-day entries are
// dots, multi-day entries are pills on an offset lane, never overlapping
// each other within a lane.
describe('layoutTimelineEntries (FR-11..FR-15)', () => {
  function entry(overrides: Partial<EntryForLayout> & Pick<EntryForLayout, 'id' | 'title' | 'startAt'>): EntryForLayout {
    return { entryType: 'ACTIVITY', subtype: null, endAt: null, ...overrides };
  }

  it('renders a single-day entry (no endAt) as a dot, not a lane pill', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [entry({ id: 'a1', title: 'Boat tour', startAt: new Date('2026-08-03T09:00:00.000Z') })];

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries, 'UTC');

    expect(laneCount).toBe(0);
    const day = laidOut.find((d) => d.dateKey === '2026-08-03')!;
    expect(day.dots.map((d) => d.id)).toEqual(['a1']);
    expect(laidOut.every((d) => d.laneSegments.length === 0)).toBe(true);
  });

  it('renders an entry whose end equals its start as a dot (Activity point-in-time)', () => {
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

    const { days: laidOut } = layoutTimelineEntries(days, entries, 'UTC');
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.dots).toHaveLength(1);
  });

  it('renders a multi-night Stay as one continuous pill, not separate dots', () => {
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

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries, 'UTC');

    expect(laneCount).toBe(1);
    const spanned = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
    for (const dateKey of spanned) {
      const day = laidOut.find((d) => d.dateKey === dateKey)!;
      expect(day.laneSegments[0]?.entryId).toBe('s1');
      expect(day.dots).toHaveLength(0);
    }
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.laneSegments[0]?.isStart).toBe(true);
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.laneSegments[0]?.isEnd).toBe(false);
    expect(laidOut.find((d) => d.dateKey === '2026-08-06')!.laneSegments[0]?.isEnd).toBe(true);
    expect(laidOut.find((d) => d.dateKey === '2026-08-06')!.laneSegments[0]?.isStart).toBe(false);
    // Days outside the Stay's span carry no segment in that lane.
    expect(laidOut.find((d) => d.dateKey === '2026-08-02')!.laneSegments[0]).toBeNull();
  });

  it('assigns overlapping multi-day entries to different lanes', () => {
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
        id: 's2',
        entryType: 'TRANSPORT',
        title: 'Rental car',
        startAt: new Date('2026-08-04T09:00:00.000Z'),
        endAt: new Date('2026-08-08T09:00:00.000Z'),
      }),
    ];

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries, 'UTC');

    expect(laneCount).toBe(2);
    const overlapDay = laidOut.find((d) => d.dateKey === '2026-08-04')!;
    const lanes = overlapDay.laneSegments.map((s) => s?.entryId).filter(Boolean);
    expect(new Set(lanes).size).toBe(2);
  });

  it('reuses a lane for a second entry that starts only after the first ends', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        entryType: 'STAY',
        title: 'Hotel A',
        startAt: new Date('2026-08-02T14:00:00.000Z'),
        endAt: new Date('2026-08-04T11:00:00.000Z'),
      }),
      entry({
        id: 's2',
        entryType: 'STAY',
        title: 'Hotel B',
        startAt: new Date('2026-08-06T14:00:00.000Z'),
        endAt: new Date('2026-08-08T11:00:00.000Z'),
      }),
    ];

    const { laneCount } = layoutTimelineEntries(days, entries, 'UTC');
    expect(laneCount).toBe(1);
  });

  // Item 9: touching (non-overlapping) entries must not waste a lane -- a
  // Stay ending the same day a following Stay begins should reuse the lane,
  // matching Section's "touching endpoints are not an overlap" convention.
  it('reuses a lane for a second entry that starts the same day the first ends (touching, not overlapping)', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        entryType: 'STAY',
        title: 'Hotel A',
        startAt: new Date('2026-08-02T14:00:00.000Z'),
        endAt: new Date('2026-08-04T11:00:00.000Z'),
      }),
      entry({
        id: 's2',
        entryType: 'STAY',
        title: 'Hotel B',
        startAt: new Date('2026-08-04T14:00:00.000Z'),
        endAt: new Date('2026-08-06T11:00:00.000Z'),
      }),
    ];

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries, 'UTC');
    expect(laneCount).toBe(1);
    // Days exclusively within each entry's own span still carry that
    // entry's segment.
    expect(laidOut.find((d) => d.dateKey === '2026-08-03')!.laneSegments[0]?.entryId).toBe('s1');
    expect(laidOut.find((d) => d.dateKey === '2026-08-05')!.laneSegments[0]?.entryId).toBe('s2');
  });

  // Truly overlapping (not just touching) entries must still get separate
  // lanes -- this is the boundary the loosened reuse check must not cross.
  it('still assigns different lanes when entries actually overlap by a day', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-10') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 's1',
        entryType: 'STAY',
        title: 'Hotel A',
        startAt: new Date('2026-08-02T14:00:00.000Z'),
        endAt: new Date('2026-08-05T11:00:00.000Z'),
      }),
      entry({
        id: 's2',
        entryType: 'STAY',
        title: 'Hotel B',
        startAt: new Date('2026-08-04T14:00:00.000Z'),
        endAt: new Date('2026-08-06T11:00:00.000Z'),
      }),
    ];

    const { laneCount } = layoutTimelineEntries(days, entries, 'UTC');
    expect(laneCount).toBe(2);
  });

  it('uses the Trip timezone, not UTC, to decide single-day vs. multi-day', () => {
    // 23:00 UTC on Aug 3 is already 06:00 on Aug 4 in Asia/Bangkok (+7) --
    // and this entry's end is 30 minutes later, same Bangkok calendar day.
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

    const { days: laidOut, laneCount } = layoutTimelineEntries(days, entries, 'Asia/Bangkok');

    expect(laneCount).toBe(0);
    expect(laidOut.find((d) => d.dateKey === '2026-08-04')!.dots.map((d) => d.id)).toEqual(['a1']);
  });

  it('drops an entry dated entirely outside the Trip range rather than crashing', () => {
    const trip = { startDate: dateOnly('2026-08-01'), endDate: dateOnly('2026-08-05') };
    const days = buildTimelineDays(trip, []);
    const entries = [
      entry({
        id: 'x1',
        title: 'Out of range',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ];

    expect(() => layoutTimelineEntries(days, entries, 'UTC')).not.toThrow();
    const { days: laidOut } = layoutTimelineEntries(days, entries, 'UTC');
    expect(laidOut.every((d) => d.dots.length === 0)).toBe(true);
  });
});
