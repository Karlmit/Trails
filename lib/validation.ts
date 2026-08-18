import { z } from 'zod';
import { locationFields } from '@/lib/entry-types/shared-fields.schema';

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

// FR-29/FR-30: username/password validation shared by signup
// (app/api/v1/auth/route.ts) and Admin-issued account creation
// (app/api/v1/users/route.ts, spec-admin-users) -- one definition so the
// two paths can't silently drift apart on a future bounds change.
export const credentialsSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(64),
  password: z.string().min(8, 'Password must be at least 8 characters').max(256),
});

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

// FR-16/FR-17, spec-ideas: Idea CRUD, mirroring the Section schema shape
// above (a single flat schema, not AD-1's per-type-discriminator pattern --
// Idea has only one shape). Scoped to spec-ideas.md's literal field list.

export const IDEA_PRIORITIES = ['MUST_DO', 'WOULD_LIKE', 'MAYBE'] as const;
export const WEATHER_SUITABILITIES = ['INDOOR', 'OUTDOOR', 'EITHER'] as const;

// Estimated expense (FR-16): amount+currency travel together or not at all,
// same "both or neither" rule as TimelineEntry's Expense (FR-22) --
// duplicated here (rather than imported from lib/entry-types/shared-fields.schema.ts)
// since the field names differ (estimated* vs Entry's expense*) and Idea
// deliberately has no payment status/note.
const estimatedExpenseAmountField = z
  .number()
  .nonnegative('Estimated expense amount cannot be negative')
  .max(9999999999.99, 'Estimated expense amount is too large')
  .optional()
  .nullable();

const estimatedExpenseCurrencyField = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter code (e.g. USD)')
  .transform((value) => value.toUpperCase())
  .optional()
  .nullable();

export function hasEstimatedExpensePair(data: {
  estimatedExpenseAmount?: number | null;
  estimatedExpenseCurrency?: string | null;
}): boolean {
  const hasAmount = data.estimatedExpenseAmount !== undefined && data.estimatedExpenseAmount !== null;
  const hasCurrency =
    data.estimatedExpenseCurrency !== undefined && data.estimatedExpenseCurrency !== null;
  return hasAmount === hasCurrency;
}

const ideaFieldsShape = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: z.string().trim().max(200).optional().nullable(),
  priority: z.enum(IDEA_PRIORITIES, {
    message: `priority must be one of: ${IDEA_PRIORITIES.join(', ')}`,
  }),
  weatherSuitability: z.enum(WEATHER_SUITABILITIES, {
    message: `weatherSuitability must be one of: ${WEATHER_SUITABILITIES.join(', ')}`,
  }),
  // No `.default([])` here deliberately -- same reasoning as
  // lib/entry-types/stay.schema.ts's `typeDetails` comment: `ideaUpdateSchema`
  // below is this same shape run through `.partial()`, and a PATCH that
  // omits `weatherTags` must leave the stored array untouched, not overwrite
  // it with `[]`. Defaulting to `[]` on create happens in the Route Handler
  // instead (app/api/v1/ideas/route.ts).
  weatherTags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  // AD-11: Idea is one of AD-11's Location-owning rows -- same shape/
  // validation as TimelineEntry's Location fields, reused directly rather
  // than redefined (unlike the expense fields above, which differ in name).
  ...locationFields,
  estimatedExpenseAmount: estimatedExpenseAmountField,
  estimatedExpenseCurrency: estimatedExpenseCurrencyField,
};

export const ideaFieldsSchema = z.object(ideaFieldsShape).strict();

export const ideaCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...ideaFieldsShape })
  .strict()
  .refine(hasEstimatedExpensePair, {
    message: 'Estimated expense requires both an amount and a currency',
    path: ['estimatedExpenseCurrency'],
  });

export const ideaUpdateSchema = ideaFieldsSchema.partial();

// FR-21, spec-checklists: Checklist/ChecklistItem CRUD, mirroring the
// Section/Idea schema shape above. Both schemas are `.strict()` so an
// unlisted field (spec's "Ask First" boundary -- nothing beyond
// title/description on Checklist, text/checked/note on ChecklistItem) is
// rejected as a 400 rather than silently ignored.

export const checklistCreateSchema = z
  .object({
    tripId: z.string().uuid('tripId must be a valid UUID'),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(5000).optional().nullable(),
  })
  .strict();

export const checklistUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
  })
  .strict();

export const checklistItemCreateSchema = z
  .object({
    checklistId: z.string().uuid('checklistId must be a valid UUID'),
    text: z.string().trim().min(1, 'Text is required').max(500),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

// Toggling checked state (FR-21's single-tap action) is just a PATCH whose
// body is `{ checked }` -- no separate endpoint from general item edits, so
// this one schema covers both.
export const checklistItemUpdateSchema = z
  .object({
    text: z.string().trim().min(1, 'Text is required').max(500).optional(),
    checked: z.boolean().optional(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();
