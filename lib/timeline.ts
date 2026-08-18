import { dateKeyInTimezone, dateKeyOfDateColumn } from '@/lib/trip-status';

export interface TimelineDay {
  dateKey: string; // YYYY-MM-DD
  sectionIndex: number | null;
  isToday: boolean;
  // Graph-column rail connectivity (git-graph-spine redesign): true when
  // this day shares the same non-null Section as its immediate neighbor,
  // so the rail segment between the two nodes renders continuous and in
  // that Section's color. A gap day, or a day at a Section boundary
  // (different Section on each side), never connects -- the rail renders
  // muted/discontinuous instead. Computed purely from neighboring
  // `sectionIndex` values, never stored.
  connectsAbove: boolean;
  connectsBelow: boolean;
}

export interface SectionRange {
  startDate: Date;
  endDate: Date;
}

/**
 * AD-2: "Membership is computed as ... always timezone-localized ... never
 * a raw UTC comparison" -- the one containment check every Section-
 * membership-by-date read path shares. `dateKey` is a caller-computed
 * `YYYY-MM-DD` (via dateKeyOfDateColumn for a calendar day, or
 * dateKeyInTimezone for an Entry's own timestamp -- see lib/budget.ts,
 * which reuses this exact function against an Entry's `startAt` anchor
 * date rather than reimplementing the containment predicate). Returns the
 * matching Section's index into `sections`, or `null` when no Section
 * covers that day.
 */
export function sectionIndexForDateKey(dateKey: string, sections: SectionRange[]): number | null {
  const index = sections.findIndex(
    (section) =>
      dateKeyOfDateColumn(section.startDate) <= dateKey &&
      dateKey <= dateKeyOfDateColumn(section.endDate),
  );
  return index === -1 ? null : index;
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
  const rawDays: Array<Pick<TimelineDay, 'dateKey' | 'sectionIndex' | 'isToday'>> = [];
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
    const sectionIndex = sectionIndexForDateKey(dateKey, sections);
    rawDays.push({
      dateKey,
      sectionIndex,
      isToday: dateKey === todayKey,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return rawDays.map((day, index) => {
    const prev = rawDays[index - 1];
    const next = rawDays[index + 1];
    return {
      ...day,
      connectsAbove: Boolean(
        prev && day.sectionIndex !== null && prev.sectionIndex === day.sectionIndex,
      ),
      connectsBelow: Boolean(
        next && day.sectionIndex !== null && next.sectionIndex === day.sectionIndex,
      ),
    };
  });
}

// spec-timeline-entries: TimelineEntry rendering on the graph spine. A
// single-day entry (its start/end fall on the same calendar day, in the
// Trip's own timezone per AD-8) is a dot on that day's node/content. A
// multi-day entry spans a colored pill down an offset lane, kept distinct
// from the Section rail/band column so it never visually collides with it
// (FR-11..FR-15 I/O matrix: "multi-day entries render as spanning pills on
// an offset lane, not overlapping the Section rail").

export interface EntryForLayout {
  id: string;
  entryType: string;
  subtype: string | null;
  title: string;
  startAt: Date;
  endAt: Date | null;
}

export interface TimelineEntryDot {
  id: string;
  entryType: string;
  subtype: string | null;
  title: string;
}

export interface TimelineLaneSegment {
  entryId: string;
  entryType: string;
  subtype: string | null;
  title: string;
  // True on the first/last rendered day of this entry's span -- used to
  // draw the pill's rounded caps only at its actual ends, flush in between,
  // so several stacked day-rows read as one continuous pill.
  isStart: boolean;
  isEnd: boolean;
  // spec-timeline-at-a-glance: the entry's own timestamps, carried straight
  // through from the `EntryForLayout` already in scope below (no new query)
  // so the Timeline page can render a real "{title} · Check-in HH:MM"-style
  // line on the start/end day, per-entry-type-worded exactly like
  // EntryDetailPanel/EntryForm already do -- see laneSegmentLabel in
  // app/(web)/trips/[tripId]/timeline/page.tsx. `endAt` mirrors
  // `EntryForLayout.endAt`'s own nullability, though in practice a segment
  // marked `isEnd` for a genuinely multi-day entry always has one (a
  // multi-day entry by definition has a real endAt).
  startAt: Date;
  endAt: Date | null;
}

export interface TimelineDayWithEntries extends TimelineDay {
  dots: TimelineEntryDot[];
  // Index = lane number; `null` where no pill occupies that lane this day.
  laneSegments: Array<TimelineLaneSegment | null>;
}

export interface TimelineLayout {
  days: TimelineDayWithEntries[];
  laneCount: number;
}

/**
 * Merges TimelineEntries onto an already-built `days` array (from
 * buildTimelineDays). Kept as a separate function -- rather than folding
 * into buildTimelineDays -- so Section-band logic and Entry-layout logic
 * stay independently testable, per this spec's "unit-tested" task.
 */
export function layoutTimelineEntries(
  days: TimelineDay[],
  entries: EntryForLayout[],
  timezone: string,
): TimelineLayout {
  const dotsByIndex = new Map<number, TimelineEntryDot[]>();
  const segmentsByIndex = new Map<number, Map<number, TimelineLaneSegment>>();
  // Lane index -> dateKey of the last day that lane is occupied through.
  const laneEnds: string[] = [];

  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  for (const entry of sorted) {
    const startKey = dateKeyInTimezone(entry.startAt, timezone);
    const endKey = entry.endAt ? dateKeyInTimezone(entry.endAt, timezone) : startKey;

    if (startKey === endKey) {
      const index = days.findIndex((day) => day.dateKey === startKey);
      // Defensive: an entry dated outside the Trip's own range is dropped
      // from rendering rather than crashing -- validation should prevent
      // this in practice, but the layout function must stay total.
      if (index === -1) continue;
      const list = dotsByIndex.get(index) ?? [];
      list.push({ id: entry.id, entryType: entry.entryType, subtype: entry.subtype, title: entry.title });
      dotsByIndex.set(index, list);
      continue;
    }

    const firstIndex = days.findIndex((day) => day.dateKey >= startKey);
    if (firstIndex === -1) continue; // entirely after the Trip's range

    let lastIndex = -1;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].dateKey <= endKey) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1 || firstIndex > lastIndex) continue; // entirely before/outside range

    // Greedy interval coloring: the first lane whose most recent occupant
    // ends on or before this entry's start (dateKeys are YYYY-MM-DD, so
    // plain string comparison sorts correctly) -- same "touching endpoints
    // are not an overlap" convention as Section bands (buildTimelineDays
    // above), so a Stay ending the day a following Stay begins reuses the
    // lane instead of wasting a second one on two ranges that never
    // actually overlap. On their shared boundary day, the later entry's
    // segment simply takes that day's cell in the lane (entries are
    // processed in start-date order, so it's written last) -- an
    // arbitrary-but-consistent pick, same as which Section a shared
    // boundary day's band renders under.
    let lane = laneEnds.findIndex((lastEnd) => lastEnd <= startKey);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endKey);
    } else {
      laneEnds[lane] = endKey;
    }

    for (let i = firstIndex; i <= lastIndex; i += 1) {
      const dayLanes = segmentsByIndex.get(i) ?? new Map<number, TimelineLaneSegment>();
      dayLanes.set(lane, {
        entryId: entry.id,
        entryType: entry.entryType,
        subtype: entry.subtype,
        title: entry.title,
        isStart: i === firstIndex,
        isEnd: i === lastIndex,
        startAt: entry.startAt,
        endAt: entry.endAt,
      });
      segmentsByIndex.set(i, dayLanes);
    }
  }

  const laneCount = laneEnds.length;
  const resultDays: TimelineDayWithEntries[] = days.map((day, index) => {
    const laneMap = segmentsByIndex.get(index);
    const laneSegments: Array<TimelineLaneSegment | null> = Array.from(
      { length: laneCount },
      (_unused, lane) => laneMap?.get(lane) ?? null,
    );
    return { ...day, dots: dotsByIndex.get(index) ?? [], laneSegments };
  });

  return { days: resultDays, laneCount };
}
