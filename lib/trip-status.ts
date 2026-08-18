// AD-8: "today" (and therefore Trip Status) is always computed server-side
// in the Trip's own timezone -- never from the browser's local clock, never
// left as an unconverted UTC comparison.

export type TripStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';

export interface TripDateRange {
  startDate: Date;
  endDate: Date;
  timezone: string;
}

/** Formats a Date as `YYYY-MM-DD` in the given IANA timezone. */
export function dateKeyInTimezone(date: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD, which also sorts correctly as a string.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `YYYY-MM-DD` for a stored `@db.Date` column (always UTC midnight). */
export function dateKeyOfDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Current hour/minute in the given timezone, for marker positioning. */
export function timeOfDayInTimezone(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/**
 * An Entry's own recorded hour/minute (TimelineEntry.startAt/endAt) --
 * read literally, with zero timezone conversion. These are the traveler's
 * own wall-clock digits, stored verbatim as UTC by `dateTimeField` (see its
 * own comment) -- never re-localized through the Trip's declared timezone
 * or the viewer's own. Never call this on `now`; use `timeOfDayInTimezone`
 * for that.
 */
export function entryClockTime(date: Date): { hour: number; minute: number } {
  return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

/**
 * Formats an Entry's own recorded startAt/endAt for display -- pinned to
 * UTC explicitly so the output is always the literal digits the traveler
 * typed, regardless of the Trip's own timezone or the viewer's browser
 * timezone. Safe to call from a Client Component: server render and
 * client hydration always agree byte-for-byte (no dependency on either
 * side's local clock), unlike `toLocaleString()`.
 */
export function formatEntryDateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

/**
 * Re-projects a real moment (`now`) onto the Trip's own local wall-clock
 * digits, returned as a Date whose UTC-read components equal those digits
 * -- e.g. 09:00 UTC with a Trip timezone six hours ahead returns a Date
 * that reads 15:00 via `getUTCHours()`. An Entry's own startAt/endAt are
 * themselves naive wall-clock values (see `dateTimeField`), not real
 * instants, so comparing a real `now` against them directly would silently
 * assume the Trip's local time is always UTC. `lib/travel-mode.ts`'s
 * CURRENT/NEXT lookups are the one place `now` needs comparing against an
 * Entry's own field, and use this to do it -- nowhere else needs it.
 */
export function tripLocalNow(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')),
  );
}

/**
 * Computes Trip Status (FR-2) from the Trip's start/end dates relative to
 * "today" in the Trip's own timezone. Never manually overridable.
 */
export function computeTripStatus(trip: TripDateRange, now: Date = new Date()): TripStatus {
  const today = dateKeyInTimezone(now, trip.timezone);
  const start = dateKeyOfDateColumn(trip.startDate);
  const end = dateKeyOfDateColumn(trip.endDate);

  if (today < start) return 'UPCOMING';
  if (today > end) return 'COMPLETED';
  return 'ACTIVE';
}

/** Trip Duration (§2.3): derived, display-only, never stored. */
export function tripDurationDays(trip: Pick<TripDateRange, 'startDate' | 'endDate'>): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = Date.UTC(
    trip.startDate.getUTCFullYear(),
    trip.startDate.getUTCMonth(),
    trip.startDate.getUTCDate(),
  );
  const end = Date.UTC(
    trip.endDate.getUTCFullYear(),
    trip.endDate.getUTCMonth(),
    trip.endDate.getUTCDate(),
  );
  return Math.round((end - start) / msPerDay) + 1;
}
