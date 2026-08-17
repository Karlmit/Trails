import { dateKeyOfDateColumn } from '@/lib/trip-status';

export interface TimelineDay {
  dateKey: string; // YYYY-MM-DD
  sectionIndex: number | null;
  isToday: boolean;
}

interface SectionRange {
  startDate: Date;
  endDate: Date;
}

/**
 * FR-8: one row per calendar day from the Trip's start to its end date,
 * inclusive, so gap days (no Section, and -- once TimelineEntries exist --
 * no Entries) stay visible rather than collapsing.
 *
 * Section band membership here is the Section's own displayed range
 * (inclusive of both endpoints, e.g. "Aug 3-7" covers Aug 3 through Aug 7)
 * -- distinct from AD-2's overlap-detection range, which must treat the
 * upper bound as exclusive so touching endpoints aren't a false overlap
 * (see the migration.sql deviation note). Rendering a shared boundary day
 * under the earlier Section's band is an arbitrary-but-consistent choice
 * since the PRD doesn't specify which of two touching Sections "wins" that
 * single day.
 *
 * FR-9/FR-10: `todayKey` (the caller-computed "today" in the Trip's own
 * timezone, or `null` for a non-Active Trip -- see computeTripStatus/
 * dateKeyInTimezone in lib/trip-status.ts) flags the single day, if any,
 * that the current-position marker and auto-scroll target key off of.
 */
export function buildTimelineDays(
  trip: { startDate: Date; endDate: Date },
  sections: SectionRange[],
  todayKey: string | null = null,
): TimelineDay[] {
  const days: TimelineDay[] = [];
  const cursor = new Date(
    Date.UTC(trip.startDate.getUTCFullYear(), trip.startDate.getUTCMonth(), trip.startDate.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(trip.endDate.getUTCFullYear(), trip.endDate.getUTCMonth(), trip.endDate.getUTCDate()),
  );

  // Defensive guard: an inverted range must never silently render as zero
  // days. This should be unreachable in practice -- both tripCreateSchema
  // and tripUpdateSchema (lib/validation.ts) reject endDate < startDate --
  // but reject loudly here too in case a future caller (or a validation
  // gap) ever gets this far with one.
  if (end.getTime() < cursor.getTime()) {
    throw new Error(
      `buildTimelineDays: trip.endDate (${end.toISOString().slice(0, 10)}) precedes trip.startDate (${cursor
        .toISOString()
        .slice(0, 10)})`,
    );
  }

  while (cursor.getTime() <= end.getTime()) {
    const dateKey = dateKeyOfDateColumn(cursor);
    const sectionIndex = sections.findIndex(
      (section) =>
        dateKeyOfDateColumn(section.startDate) <= dateKey &&
        dateKey <= dateKeyOfDateColumn(section.endDate),
    );
    days.push({
      dateKey,
      sectionIndex: sectionIndex === -1 ? null : sectionIndex,
      isToday: dateKey === todayKey,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}
