import { z } from 'zod';
import { Locale } from '@prisma/client';
import { locationFields } from '@/lib/entry-types/shared-fields.schema';
import { SECTION_COLOR_VALUES, SECTION_EMOJI_OPTIONS } from '@/lib/section-colors';

// FR-1: Trip.coverImage was previously a data-model-only field (no UI ever
// let a User set it -- logged in deferred-work.md as blocked on the
// file-upload work landing; Photos (spec-tags-links-photos) shipped since,
// but a Trip isn't one of AD-4's three Photo owner types, so this stays the
// "simple URL-string input" fallback that note itself suggested, not a
// Photo-table wiring -- that would need its own architecture amendment,
// same as spec-documents' disclosed Trip-owner-type gap). Rendered as a
// plain `<img src>` (components/TripOverviewPanel.tsx), never a clickable
// `<a href>`, so this isn't the same stored-XSS shape locationMapLinkField
// guards against (javascript: doesn't execute from an img src) -- the
// http(s)-only check here is just the same cheap, consistent defensive
// practice, not a response to a demonstrated exploit.
const coverImageField = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: 'Cover image must be a valid http(s) URL' },
  );

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
 *
 * A datetime string with no explicit zone (the shape every date/time picker
 * in this app submits, e.g. `2026-08-05T15:00`) is always treated as UTC
 * here, regardless of the server's own runtime timezone -- these are the
 * traveler's own literal, wall-clock digits, and the app deliberately never
 * applies any real timezone conversion to an Entry's own recorded time
 * (only to `now`, for Trip Status / the Timeline's current-position marker
 * -- see lib/trip-status.ts's `timeOfDayInTimezone`/`dateKeyInTimezone`).
 * Relying on `new Date(value)`'s own "no zone = server-local time" behavior
 * would make storage depend on whatever timezone the Node process happens
 * to run in -- true today (the Docker image runs as UTC) but not a
 * guaranteed invariant, so it's made explicit here instead. A string that
 * DOES carry an explicit zone (`Z` or a numeric offset) is parsed as-is,
 * unchanged.
 */
const UNZONED_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

export const dateTimeField = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid date/time' })
  .transform((value) => new Date(UNZONED_DATETIME.test(value) ? `${value}Z` : value));

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

// spec-timeline-ux-and-timezone (correction): TimelineEntry.startTimezone/
// endTimezone -- unlike the Trip's own `timezoneField` above, always
// optional and nullable (NULL is the meaningful default: "no override,
// literal digits" -- see dateTimeField's comment), and Transport-only in
// practice.
export const entryTimezoneField = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTimezone, { message: 'Must be a valid IANA timezone identifier' })
  .optional()
  .nullable();

export const tripCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    destination: z.string().trim().max(200).optional().nullable(),
    startDate: dateOnly,
    endDate: dateOnly,
    timezone: timezoneField,
    description: z.string().max(5000).optional().nullable(),
    coverImage: coverImageField,
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    // User-requested: a manual override so a Trip reads as ACTIVE
    // regardless of its dates -- see lib/trip-status.ts's computeTripStatus.
    pinnedActive: z.boolean().optional(),
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
    coverImage: coverImageField,
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    pinnedActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate.getTime() >= data.startDate.getTime(),
    { message: 'End date must be on or after the start date', path: ['endDate'] },
  );

// spec-sections-color-emoji: both optional AND nullable on create/update --
// a Section a User never customizes has `color`/`emoji` left `undefined`
// (create) or omitted entirely (update, existing value untouched, same
// merge-before-validate convention as name/dates below), while explicitly
// passing `null` clears a previously-set value back to the auto-cycled
// fallback (color) / no label emoji (emoji). Curated-set-only, not a free
// hex/text input (spec's "Ask First" boundary) -- anything else is a clean
// 400, not silently accepted or dropped.
const sectionColorField = z
  .string()
  .optional()
  .nullable()
  .refine((value) => value === undefined || value === null || SECTION_COLOR_VALUES.includes(value), {
    message: `color must be one of the curated palette values: ${SECTION_COLOR_VALUES.join(', ')}`,
  });

const sectionEmojiField = z
  .string()
  .optional()
  .nullable()
  .refine((value) => value === undefined || value === null || SECTION_EMOJI_OPTIONS.includes(value), {
    message: `emoji must be one of the curated emoji set: ${SECTION_EMOJI_OPTIONS.join(' ')}`,
  });

export const sectionCreateSchema = z
  .object({
    tripId: z.string().uuid('tripId must be a valid UUID'),
    name: z.string().trim().min(1, 'Name is required').max(200),
    startDate: dateOnly,
    endDate: dateOnly,
    color: sectionColorField,
    emoji: sectionEmojiField,
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
    color: sectionColorField,
    emoji: sectionEmojiField,
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
  // Optional link to a Section (the one deliberate exception to AD-2 --
  // see the Section/Idea Prisma model comments). The Route Handler, not
  // this schema, checks the referenced Section actually belongs to the
  // same Trip -- a cross-trip id is a 400 there, not a DB constraint
  // violation.
  sectionId: z.string().uuid('sectionId must be a valid UUID').optional().nullable(),
  category: z.string().trim().max(200).optional().nullable(),
  // User-requested optional free text -- same bound as ImportantInfo.content.
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(IDEA_PRIORITIES, {
    message: `priority must be one of: ${IDEA_PRIORITIES.join(', ')}`,
  }),
  weatherSuitability: z.enum(WEATHER_SUITABILITIES, {
    message: `weatherSuitability must be one of: ${WEATHER_SUITABILITIES.join(', ')}`,
  }),
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
// unlisted field (spec's "Ask First" boundary) is rejected as a 400 rather
// than silently ignored. `description` was removed outright (user: "Fully
// remove description from checklists, its not needed"); `emoji` is free
// text typed via the device's own emoji keyboard, no curated set like
// Section's.

export const checklistCreateSchema = z
  .object({
    tripId: z.string().uuid('tripId must be a valid UUID'),
    title: z.string().trim().min(1, 'Title is required').max(200),
    emoji: z.string().trim().max(16).optional().nullable(),
    // User-requested: "Checklists can be marked as private or shared with
    // other trip users." Stored/toggleable the same as
    // ImportantInfo.isPrivate -- see that field's schema comment for why
    // this has no read-time enforcement effect yet.
    isPrivate: z.boolean().optional(),
  })
  .strict();

export const checklistUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200).optional(),
    emoji: z.string().trim().max(16).optional().nullable(),
    isPrivate: z.boolean().optional(),
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

// Multi-language support: the only field PATCH /api/v1/me accepts -- a
// signed-in User's own language preference (lib/locale.ts's resolveLocale
// reads this back on every subsequent request).
export const localeSchema = z
  .object({
    locale: z.nativeEnum(Locale),
  })
  .strict();
