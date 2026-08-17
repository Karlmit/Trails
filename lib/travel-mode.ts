// FR-27, spec-travel-mode: pure CURRENT/NEXT lookups for the in-trip focused
// view. Same "pure lib functions + thin Server Component" split as
// lib/budget.ts -- the page (app/(web)/trips/[tripId]/travel-mode/page.tsx)
// queries Prisma (already filtered through `timelineVisibleEntryWhere()`,
// AD-10 -- these functions never re-check that predicate themselves, same
// division of responsibility as lib/budget.ts's BudgetEntryInput assuming
// its caller already applied `expenseAmount: { not: null }`) and calls
// these; no new Prisma model, no cached "current"/"next" anywhere (AD-3's
// no-caching principle, reapplied here per the spec's "Always" boundary).
//
// Every function takes `now: Date` explicitly (never reads `new Date()`
// internally), matching `computeTripStatus(trip, now: Date = new Date())`
// in lib/trip-status.ts -- deterministic and unit-testable; the page passes
// the real clock in, tests pass a fixed Date.

import { dateKeyInTimezone } from '@/lib/trip-status';

export interface TravelModeEntry {
  id: string;
  entryType: string;
  startAt: Date;
  endAt: Date | null;
}

/**
 * Current Stay: `startAt <= now <= endAt` among STAY entries (both fields
 * required/non-null on Stay -- a clean range check, per the spec's "Current
 * Stay / current Transport-in-progress" semantics). If more than one Stay's
 * range covers `now` (e.g. overlapping bookings -- unusual but possible),
 * the one with the earliest `startAt` wins, a simple deterministic
 * tie-break.
 */
export function findCurrentStay<T extends TravelModeEntry>(entries: T[], now: Date): T | null {
  const matches = entries.filter(
    (entry) =>
      entry.entryType === 'STAY' &&
      entry.endAt !== null &&
      entry.startAt.getTime() <= now.getTime() &&
      now.getTime() <= entry.endAt.getTime(),
  );
  return earliestStart(matches);
}

/**
 * Current Activity: `startAt <= now` AND (`endAt` set ? `now <= endAt` :
 * `dateKeyInTimezone(startAt, tz) === todayKey`) -- Activity's `endAt` is
 * optional (a point-in-time Activity, e.g. "Museum tour at 2pm"). A
 * point-in-time Activity stays Current for the remainder of the calendar
 * day it starts, mirroring how the Timeline already treats single-day
 * entries as belonging to that whole day rather than one instant. Same
 * earliest-`startAt` tie-break as `findCurrentStay` if more than one
 * matches.
 */
export function findCurrentActivity<T extends TravelModeEntry>(
  entries: T[],
  now: Date,
  timezone: string,
): T | null {
  const todayKey = dateKeyInTimezone(now, timezone);
  const matches = entries.filter((entry) => {
    if (entry.entryType !== 'ACTIVITY') return false;
    if (entry.startAt.getTime() > now.getTime()) return false;
    if (entry.endAt !== null) return now.getTime() <= entry.endAt.getTime();
    return dateKeyInTimezone(entry.startAt, timezone) === todayKey;
  });
  return earliestStart(matches);
}

/**
 * Next entry of category `entryType` (or overall, when `entryType` is
 * omitted/null -- "next TimelineEntry overall") with the smallest `startAt`
 * that is `> now`. Four independent lookups per the spec (overall,
 * Transport, Activity, Stay) -- the next entry of any type may or may not
 * be the same row as e.g. the next Transport, so each is its own call.
 */
export function findNextByType<T extends TravelModeEntry>(
  entries: T[],
  now: Date,
  entryType?: string | null,
): T | null {
  const candidates = entries.filter(
    (entry) =>
      (entryType == null || entry.entryType === entryType) && entry.startAt.getTime() > now.getTime(),
  );
  return candidates.reduce<T | null>((soonest, entry) => {
    if (!soonest || entry.startAt.getTime() < soonest.startAt.getTime()) return entry;
    return soonest;
  }, null);
}

function earliestStart<T extends TravelModeEntry>(entries: T[]): T | null {
  return entries.reduce<T | null>((earliest, entry) => {
    if (!earliest || entry.startAt.getTime() < earliest.startAt.getTime()) return entry;
    return earliest;
  }, null);
}

/**
 * FR-27's quick-access map link: a Google Maps *search* URL, not the
 * entry's own stored `locationMapLink` -- this must always work as long as
 * an entry has a `locationAddress` or `locationName`, even when
 * `locationMapLink` was never set. Opens externally (a plain `<a href>`,
 * per the spec's "no in-app map" boundary), never rendered as an in-app map.
 */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Resolves which text to search for on a CURRENT/NEXT entry's map link:
 * `locationAddress` preferred, `locationName` as a fallback when only that's
 * set, `null` when neither is present (no map link rendered at all for that
 * entry -- I/O matrix: "Location present on a Current/Next entry").
 */
export function entryMapsUrl(entry: {
  locationAddress?: string | null;
  locationName?: string | null;
}): string | null {
  const address = entry.locationAddress || entry.locationName;
  return address ? mapsSearchUrl(address) : null;
}
