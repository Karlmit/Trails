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
  // User-requested: Transport's optional connecting itinerary (stopovers +
  // per-leg flight numbers) needs to reach the Timeline's start-day label --
  // every other Entry Type's typeDetails is unused here. Untyped on
  // purpose, same as TimelineEntry.typeDetails itself (a schemaless Json
  // column) -- the Timeline page's own dayLineLabel narrows it.
  typeDetails?: unknown;
}

/**
 * spec-timeline-git-graph: one line per (Entry, day it touches) -- the
 * single unified shape for both a one-day Entry (isStart and isEnd both
 * true, rendered as a dot on the trunk) and every day a multi-day Entry
 * spans (rendered as a branch). A day's `lines` is a plain array -- every
 * Entry that touches that day always gets an entry in it, so two Entries
 * touching the same day (a Stay's own check-out and the next Stay's
 * check-in; a Transport's arrival and whatever else is happening that day)
 * can never clobber each other's information.
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
  // See EntryForLayout's identical comment -- carried through unchanged.
  typeDetails?: unknown;
}

/**
 * spec-timeline-git-graph: user-directed redesign, modeled directly on
 * GitKraken's own branch/merge graph -- "we use a main line the same color
 * as the section; if a stay or travel is planned this branches out of the
 * main line and then back in whenever the end date is." Any Entry that
 * spans more than one day (Stay *or* Transport, whichever type -- the
 * previous design's mistake was treating them differently, one with a
 * dedicated ribbon and the other with none at all, so they visually
 * competed for the same lanes) gets one `TimelineBranchSegment` per day it
 * touches:
 *   - `'start'` on its first day -- the trunk peels off into this lane.
 *   - `'through'` on every day strictly between -- runs parallel to the
 *     trunk, full row height.
 *   - `'end'` on its last day -- this lane merges back into the trunk.
 * Two Entries meeting on the same day in the same lane (one's `'end'`, the
 * next's `'start'`) simply both appear in that day's `branches` array --
 * rendered as a merge-curve immediately followed by a branch-curve, the
 * same shape a real git graph draws when one branch merges and another
 * forks at nearly the same commit. No special-casing needed: the day-level
 * `lines`/`branches` arrays are always plain, never-clobbered lists.
 */
export interface TimelineBranchSegment {
  entryId: string;
  entryType: string;
  laneIndex: number;
  position: 'start' | 'through' | 'end';
}

export interface TimelineDayWithEntries extends TimelineDay {
  lines: TimelineDayLine[];
  branches: TimelineBranchSegment[];
}

export interface TimelineLayout {
  days: TimelineDayWithEntries[];
  // The most concurrent multi-day Entries active at once -- how many
  // branch lanes the Timeline page needs to reserve room for. 1 in the
  // overwhelming common case; >1 only when two multi-day Entries
  // genuinely overlap (not just touch).
  laneCount: number;
}

/**
 * Merges TimelineEntries onto an already-built `days` array (from
 * buildTimelineDays). Kept as a separate function -- rather than folding
 * into buildTimelineDays -- so Section-band logic and Entry-layout logic
 * stay independently testable, per this spec's "unit-tested" task.
 */
export function layoutTimelineEntries(days: TimelineDay[], entries: EntryForLayout[]): TimelineLayout {
  const resultDays: TimelineDayWithEntries[] = days.map((day) => ({ ...day, lines: [], branches: [] }));

  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  interface LaneOccupant {
    entryId: string;
    endDayIndex: number;
  }
  const laneOccupants: Array<LaneOccupant | null> = [];

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
    // per-day "cell" of any kind, so nothing can clobber anything else.
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
        typeDetails: entry.typeDetails,
      });
    }

    if (lastIndex === firstIndex) continue; // single-day -- a dot on the trunk, no branch/lane at all

    // Greedy interval coloring, same "touching endpoints reuse the lane"
    // convention as the Section band's own containment rule -- across
    // *every* multi-day Entry Type together (Stay and Transport share the
    // same lane pool; a lane represents "a branch is active," not "a Stay
    // is active"), so a Transport's own branch never needs special-casing
    // relative to a Stay's.
    let lane = laneOccupants.findIndex((occupant) => occupant === null || occupant.endDayIndex <= firstIndex);
    if (lane === -1) {
      lane = laneOccupants.length;
      laneOccupants.push(null);
    }
    laneOccupants[lane] = { entryId: entry.id, endDayIndex: lastIndex };

    for (let i = firstIndex; i <= lastIndex; i += 1) {
      const position = i === firstIndex ? 'start' : i === lastIndex ? 'end' : 'through';
      resultDays[i].branches.push({ entryId: entry.id, entryType: entry.entryType, laneIndex: lane, position });
    }
  }

  return { days: resultDays, laneCount: laneOccupants.length };
}
