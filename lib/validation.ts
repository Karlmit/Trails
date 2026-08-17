import { z } from 'zod';

// Shared cross-field helpers used by the Trip/Section Zod schemas (AD-1's
// "one Zod schema" convention, applied here even though TimelineEntry
// itself doesn't exist yet in this spec).

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Accepts `YYYY-MM-DD` (or a full ISO datetime) and returns a UTC-midnight Date. */
export const dateOnly = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date' })
  .transform((value) => {
    const isoDatePart = value.length >= 10 ? value.slice(0, 10) : value;
    return new Date(`${isoDatePart}T00:00:00.000Z`);
  });

/**
 * `tripUpdateSchema`/`sectionUpdateSchema` only validate endDate >= startDate
 * when *both* fields appear in the same PATCH body -- a partial update
 * supplying just one of them skips that check entirely at the schema level.
 * Route Handlers must call this after merging the parsed partial update onto
 * the existing row's current dates, so a one-field PATCH can never invert
 * the pair.
 */
export function isDateOrderValid(startDate: Date, endDate: Date): boolean {
  return endDate.getTime() >= startDate.getTime();
}

/**
 * TimelineEntry's `start_at`/`end_at` (AD-1) are full timestamps, not
 * calendar dates -- unlike `dateOnly` above, this preserves time-of-day and
 * accepts any ISO 8601 datetime string.
 */
export const dateTimeField = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date/time' })
  .transform((value) => new Date(value));

/**
 * Shared start/end ordering check for TimelineEntry types (FR-11/FR-12
 * require a strictly later end; FR-13 allows an Activity's end to equal its
 * start). Same merge-after-partial-PATCH usage pattern as isDateOrderValid.
 */
export function isDateTimeOrderValid(
  startAt: Date,
  endAt: Date,
  { allowEqual = false }: { allowEqual?: boolean } = {},
): boolean {
  return allowEqual ? endAt.getTime() >= startAt.getTime() : endAt.getTime() > startAt.getTime();
}

export const timezoneField = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .refine(isValidTimezone, { message: 'Must be a valid IANA timezone identifier' });

export const tripCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    destination: z.string().trim().max(200).optional().nullable(),
    startDate: dateOnly,
    endDate: dateOnly,
    timezone: timezoneField,
    description: z.string().max(5000).optional().nullable(),
    coverImage: z.string().trim().max(2048).optional().nullable(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .refine((data) => data.endDate.getTime() >= data.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const tripUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    destination: z.string().trim().max(200).optional().nullable(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    timezone: timezoneField.optional(),
    description: z.string().max(5000).optional().nullable(),
    coverImage: z.string().trim().max(2048).optional().nullable(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate.getTime() >= data.startDate.getTime(),
    { message: 'End date must be on or after the start date', path: ['endDate'] },
  );

export const sectionCreateSchema = z
  .object({
    tripId: z.string().uuid('tripId must be a valid UUID'),
    name: z.string().trim().min(1, 'Name is required').max(200),
    startDate: dateOnly,
    endDate: dateOnly,
  })
  .refine((data) => data.endDate.getTime() >= data.startDate.getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const sectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate.getTime() >= data.startDate.getTime(),
    { message: 'End date must be on or after the start date', path: ['endDate'] },
  );
