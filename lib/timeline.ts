import { dateKeyOfDateColumn, entryEndpointDateKey } from '@/lib/trip-status';

export interface TimelineDay {
  dateKey: string; // YYYY-MM-DD
  sectionIndex: number | null;
  isToday: boolean;
}

export interface SectionRange {
  startDate: Date;
  endDate: Date;
}

/**
 * The one containment check every Section-membership-by-date read path
 * shares. `dateKey` is a caller-computed `YYYY-MM-DD` -- `dateKeyOfDateColumn`
 * in every case: a calendar day for the Timeline's own day rows, and (per a
 * later correction to AD-2/AD-8) an Entry's own literal `startAt`/`endAt`
 * anchor date too, never re-localized through the Trip's timezone -- see
 * dateTimeField's comment (lib/validation.ts) for why an Entry's own
 * recorded time is treated as a naive wall-clock value, not a real instant.
 * lib/budget.ts reuses this exact function against an Entry's `startAt`
 * anchor date rather than reimplementing the containment predicate.
 * Returns the matching Section's index into `sections`, or `null` when no
 * Section covers that day.
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
 *
 * spec-timeline-visual-redesign: no longer computes rail-connectivity
 * flags (`connectsAbove`/`connectsBelow`) -- the graph-column dot rail
 * they drove has been removed entirely (see the Timeline page's own
 * comment for why). A Section's contiguous run is now identified purely
 * by comparing a day's own `sectionIndex` to its immediate neighbor's,
 * done once, inline, by the one caller that needs it (the Timeline page,
 * deciding where to render the Section name pill) -- not worth carrying
 * as two booleans on every single day going forward.
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
    days.push({
      dateKey,
      sectionIndex: sectionIndexForDateKey(dateKey, sections),
      isToday: dateKey === todayKey,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export interface EntryForLayout {
  id: string;
  entryType: string;
  subtype: string | null;
  title: string;
  startAt: Date;
  endAt: Date | null;
  // spec-timeline-ux-and-timezone (correction): NULL for every type but
  // Transport -- see TimelineEntry.startTimezone's own schema comment. When
  // set, startAt/endAt are real UTC instants that must be converted through
  // this zone (entryEndpointDateKey/entryEndpointClockTime, lib/trip-status.ts)
  // to recover the traveler's intended day/clock time for this leg.
  startTimezone: string | null;
  endTimezone: string | null;
}

/**
 * spec-timeline-visual-redesign: one line per (Entry, day it touches) --
 * the single unified shape for both a one-day Entry (isStart and isEnd
 * both true) and every day a multi-day Entry spans. Replaces the old
 * `TimelineEntryDot`/`TimelineLaneSegment` split, whose two *separate*
 * per-day data structures were exactly why a shared boundary day could
 * lose one entry's information to another's: a Stay's own check-out day
 * and the next Stay's check-in day, or a Transport's own arrival day and
 * whatever else happened to land there, each fought over one lane-indexed
 * "cell" that could hold only one occupant. A day's `lines` is a plain
 * array -- every Entry that touches that day always gets an entry in it,
 * independent of how many others do too.
 */
export interface TimelineDayLine {
  entryId: string;
  entryType: string;
  subtype: string | null;
  title: string;
  isStart: boolean;
  isEnd: boolean;
  startAt: Date;
  endAt: Date | null;
  startTimezone: string | null;
  endTimezone: string | null;
}

/**
 * spec-timeline-visual-redesign: a Stay's own continuous "ribbon" -- the
 * one Entry Type that represents *being somewhere* for a span of days, so
 * it's the one type that gets a genuine multi-row visual object (rendered
 * by the Timeline page as a single CSS Grid item spanning
 * `startDayIndex`..`endDayIndex` rows, not stacked per-day segments trying
 * to fake continuity -- the previous design's "lines end abruptly"
 * complaint). Transport/Activity are transitions, not places -- they never
 * get a ribbon, only their own `TimelineDayLine`s (Departure/Arrival text),
 * so they can never compete with a Stay's ribbon for lane space (the
 * previous design's "travel lines share the same space as stay lines"
 * complaint: both types drew from one shared lane pool).
 */
export interface StayRibbonSpan {
  entryId: string;
  title: string;
  // Alternates by chronological order among Stays only, 0/1 -- two
  // adjacent Stays are always visually distinguishable, including at a
  // same-day handoff (see StayHandoff below).
  colorIndex: 0 | 1;
  startDayIndex: number; // inclusive index into the `days` array
  endDayIndex: number; // inclusive
  laneIndex: number; // 0 unless two Stays genuinely overlap (rare)
  // True when this ribbon's own last day was shortened by one, to make
  // room for a StayHandoff marker on what would otherwise be a shared,
  // ambiguous day -- the Timeline page uses this to decide whether the
  // ribbon's bottom end draws a rounded "true end" cap (false) or a flat
  // edge that visually continues into the handoff marker (true).
  truncatedForHandoff: boolean;
}

/**
 * spec-timeline-visual-redesign: the day two Stays meet -- one's check-out,
 * the next's check-in, both real and both worth seeing at a glance. Rather
 * than force one ribbon to visually "win" that day (the previous design's
 * silent-data-loss bug), it gets its own small two-tone marker instead,
 * and both TimelineDayLines (Check-out text, Check-in text) still render
 * normally underneath, exactly like any other day.
 */
export interface StayHandoff {
  dayIndex: number;
  laneIndex: number;
  outgoingEntryId: string;
  outgoingColorIndex: 0 | 1;
  incomingEntryId: string;
  incomingColorIndex: 0 | 1;
}

export interface TimelineDayWithEntries extends TimelineDay {
  lines: TimelineDayLine[];
}

export interface TimelineLayout {
  days: TimelineDayWithEntries[];
  stayRibbons: StayRibbonSpan[];
  stayHandoffs: StayHandoff[];
  // How many ribbon columns the Timeline page needs to reserve -- 1 in the
  // overwhelming common case, >1 only when two Stays genuinely overlap
  // (not just touch) rather than a data-entry mistake to guard, not a
  // layout this app's booking model expects.
  stayLaneCount: number;
}

/**
 * Merges TimelineEntries onto an already-built `days` array (from
 * buildTimelineDays). Kept as a separate function -- rather than folding
 * into buildTimelineDays -- so Section-band logic and Entry-layout logic
 * stay independently testable, per this spec's "unit-tested" task.
 */
export function layoutTimelineEntries(days: TimelineDay[], entries: EntryForLayout[]): TimelineLayout {
  const resultDays: TimelineDayWithEntries[] = days.map((day) => ({ ...day, lines: [] }));

  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  interface LaneOccupant {
    entryId: string;
    endDayIndex: number;
    colorIndex: 0 | 1;
  }
  const laneOccupants: Array<LaneOccupant | null> = [];
  const stayRibbons: StayRibbonSpan[] = [];
  const stayHandoffs: StayHandoff[] = [];

  for (const entry of sorted) {
    const startKey = entryEndpointDateKey(entry.startAt, entry.startTimezone);
    const endKey = entry.endAt ? entryEndpointDateKey(entry.endAt, entry.endTimezone) : startKey;

    const firstIndex = days.findIndex((day) => day.dateKey >= startKey);
    // Defensive: an entry dated outside the Trip's own range is dropped
    // from rendering rather than crashing -- validation should prevent
    // this in practice, but the layout function must stay total.
    if (firstIndex === -1) continue; // entirely after the Trip's range

    let lastIndex = -1;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].dateKey <= endKey) {
        lastIndex = i;
        break;
      }
    }
    if (lastIndex === -1 || firstIndex > lastIndex) continue; // entirely before/outside range

    // Every Entry that touches a day gets its own line there -- no shared
    // per-day "cell" of any kind, so two Entries touching the same day
    // (a Stay's check-out and the next Stay's check-in; a Transport's
    // arrival and whatever else is happening that day) can never clobber
    // each other.
    for (let i = firstIndex; i <= lastIndex; i += 1) {
      resultDays[i].lines.push({
        entryId: entry.id,
        entryType: entry.entryType,
        subtype: entry.subtype,
        title: entry.title,
        isStart: i === firstIndex,
        isEnd: i === lastIndex,
        startAt: entry.startAt,
        endAt: entry.endAt,
        startTimezone: entry.startTimezone,
        endTimezone: entry.endTimezone,
      });
    }

    if (entry.entryType !== 'STAY') continue; // only a Stay gets a ribbon

    // Greedy interval coloring, same "touching endpoints reuse the lane"
    // convention as the Section band's own containment rule -- but now
    // scoped to Stay entries only, and a touching reuse produces a
    // StayHandoff marker instead of letting the two ribbons fight over
    // the shared day.
    let lane = laneOccupants.findIndex((occupant) => occupant === null || occupant.endDayIndex <= firstIndex);
    if (lane === -1) {
      lane = laneOccupants.length;
      laneOccupants.push(null);
    }

    const previousOccupant = laneOccupants[lane];
    // Alternates against *this lane's own* previous occupant, not a global
    // running count -- an unrelated Stay briefly claiming a different lane
    // (a genuine overlap) must never shift which color a real touching
    // handoff's two ribbons end up with. Two Stays sharing a handoff are
    // always adjacent occupants of the *same* lane by construction, so
    // this alone guarantees they always differ.
    const colorIndex: 0 | 1 = previousOccupant ? (previousOccupant.colorIndex === 0 ? 1 : 0) : 0;

    if (previousOccupant && previousOccupant.endDayIndex === firstIndex) {
      const outgoingRibbon = stayRibbons.find((ribbon) => ribbon.entryId === previousOccupant.entryId);
      // A same-day (check-in === check-out) Stay immediately followed by
      // another can't be shortened below its own single day -- the ribbon
      // and the handoff marker both occupy that one day, a rare, harmless
      // degenerate case rather than one worth more machinery for.
      if (outgoingRibbon && outgoingRibbon.endDayIndex > outgoingRibbon.startDayIndex) {
        outgoingRibbon.endDayIndex -= 1;
        outgoingRibbon.truncatedForHandoff = true;
      }
      stayHandoffs.push({
        dayIndex: firstIndex,
        laneIndex: lane,
        outgoingEntryId: previousOccupant.entryId,
        outgoingColorIndex: previousOccupant.colorIndex,
        incomingEntryId: entry.id,
        incomingColorIndex: colorIndex,
      });
    }

    laneOccupants[lane] = { entryId: entry.id, endDayIndex: lastIndex, colorIndex };
    stayRibbons.push({
      entryId: entry.id,
      title: entry.title,
      colorIndex,
      startDayIndex: firstIndex,
      endDayIndex: lastIndex,
      laneIndex: lane,
      truncatedForHandoff: false,
    });
  }

  return { days: resultDays, stayRibbons, stayHandoffs, stayLaneCount: laneOccupants.length };
}
