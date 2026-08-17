import { describe, expect, it } from 'vitest';
import { buildTimelineDays } from '@/lib/timeline';

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
