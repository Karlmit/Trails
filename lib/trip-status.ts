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
