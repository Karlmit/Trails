import type { EntrySubtype, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { isDateTimeOrderValid } from '@/lib/validation';
import { dateKeyInTimezone, dateKeyOfDateColumn } from '@/lib/trip-status';
import { activityCreateSchema, activityUpdateSchema } from './activity.schema';
import { blogPostCreateSchema, blogPostUpdateSchema } from './blog-post.schema';
import { noteCreateSchema, noteUpdateSchema } from './note.schema';
import { stayCreateSchema, stayUpdateSchema } from './stay.schema';
import { transportCreateSchema, transportUpdateSchema } from './transport.schema';

// AD-1: `entry_type` is `Stay | Transport | Activity | Note | BlogPost`.
// spec-blog (FR-18-20) adds BlogPost as a fifth creatable/editable type --
// "creatable" here means "has its own Zod schema and can be
// created/read/updated/deleted through app/api/v1/timeline-entries", a
// distinct concept from "appears in the generic /entries/new type picker"
// (components/EntryForm.tsx keeps its own separate, still-4-type picker --
// Blog Posts are only ever created from /trips/[tripId]/blog, never from
// that generic picker).
export const CREATABLE_ENTRY_TYPES = ['STAY', 'TRANSPORT', 'ACTIVITY', 'NOTE', 'BLOG_POST'] as const;
export type CreatableEntryType = (typeof CREATABLE_ENTRY_TYPES)[number];

export function isCreatableEntryType(value: string): value is CreatableEntryType {
  return (CREATABLE_ENTRY_TYPES as readonly string[]).includes(value);
}

// spec-blog: Blog Posts live under their own /blog/[entryId] page, never
// /entries/[entryId] (which explicitly 404s a BLOG_POST row) -- any UI
// linking to an entry's detail page (e.g. the Timeline's dots/lane
// segments) must branch on entryType, not assume one route for all
// CREATABLE_ENTRY_TYPES.
export function entryDetailHref(tripId: string, entryType: string, entryId: string): string {
  return entryType === 'BLOG_POST'
    ? `/trips/${tripId}/blog/${entryId}`
    : `/trips/${tripId}/entries/${entryId}`;
}

// One Zod schema per entry_type (AD-1), selected by the discriminator.
export const CREATE_SCHEMAS = {
  STAY: stayCreateSchema,
  TRANSPORT: transportCreateSchema,
  ACTIVITY: activityCreateSchema,
  NOTE: noteCreateSchema,
  BLOG_POST: blogPostCreateSchema,
} satisfies Record<CreatableEntryType, z.ZodTypeAny>;

export const UPDATE_SCHEMAS = {
  STAY: stayUpdateSchema,
  TRANSPORT: transportUpdateSchema,
  ACTIVITY: activityUpdateSchema,
  NOTE: noteUpdateSchema,
  BLOG_POST: blogPostUpdateSchema,
} satisfies Record<CreatableEntryType, z.ZodTypeAny>;

// AD-10: "Excluding Draft Blog Posts (published_at IS NULL) from Timeline
// rendering is an unconditional base-query filter, applied to every viewer
// including authenticated Users -- it is not part of Guest filtering."
// Stay/Transport/Activity/Note render on the Timeline unconditionally;
// BlogPost renders there only once Published. This is the one shared
// predicate every Timeline-rendering read path uses -- the Timeline Server
// Component (app/(web)/trips/[tripId]/timeline/page.tsx) and the
// timeline-entries list Route Handler (GET /api/v1/timeline-entries) both
// call this rather than each re-implementing "exclude Draft Blog Posts"
// inline and risking drift. Derived from `CREATABLE_ENTRY_TYPES` (rather
// than hand-duplicated) specifically *excluding* BLOG_POST, so a future
// 6th entry type added only to `CREATABLE_ENTRY_TYPES` can't silently
// become unconditionally Timeline-visible (or vanish from it) with no
// deliberate decision made here.
const TIMELINE_ALWAYS_VISIBLE_ENTRY_TYPES = CREATABLE_ENTRY_TYPES.filter(
  (type) => type !== 'BLOG_POST',
);

export function timelineVisibleEntryWhere(): Prisma.TimelineEntryWhereInput {
  return {
    OR: [
      { entryType: { in: [...TIMELINE_ALWAYS_VISIBLE_ENTRY_TYPES] } },
      { entryType: 'BLOG_POST', publishedAt: { not: null } },
    ],
  };
}

export { STAY_SUBTYPES } from './stay.schema';
export { TRANSPORT_MODES } from './transport.schema';
export { ACTIVITY_SUBTYPES } from './activity.schema';

// Loose shape shared by every type's parsed create/update output -- used
// only at the Route Handler boundary (app/api/v1/timeline-entries/**) to
// funnel any of the 4 per-type Zod outputs into one Prisma data builder
// without fighting a union type across 4 structurally-different schemas.
// Zod has already validated every field actually used below; this is a
// deliberate, narrow trust boundary, not a bypass of validation.
export interface ParsedEntryFields {
  tripId?: string;
  title?: string;
  description?: string | null;
  subtype?: string;
  startAt?: Date;
  endAt?: Date | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationMapLink?: string | null;
  bookingReference?: string | null;
  expenseAmount?: number | null;
  expenseCurrency?: string | null;
  expensePaymentStatus?: string | null;
  expensePaymentNote?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  postTripNotes?: string | null;
  typeDetails?: Record<string, unknown>;
  isPrivate?: boolean;
}

/**
 * Builds a `prisma.timelineEntry.create` `data` object from a validated,
 * per-type parsed body. `tripId`/`startAt`/`title` are required by every
 * create schema; every other field is nullable on the model (AD-1), so a
 * type that doesn't carry it (e.g. Note has no `subtype`/location/expense)
 * simply writes NULL.
 */
export function toEntryCreateData(entryType: CreatableEntryType, parsed: ParsedEntryFields) {
  return {
    tripId: parsed.tripId as string,
    entryType,
    subtype: (parsed.subtype ?? null) as EntrySubtype | null,
    title: parsed.title as string,
    description: parsed.description ?? null,
    startAt: parsed.startAt as Date,
    endAt: parsed.endAt ?? null,
    locationName: parsed.locationName ?? null,
    locationAddress: parsed.locationAddress ?? null,
    locationLat: parsed.locationLat ?? null,
    locationLng: parsed.locationLng ?? null,
    locationMapLink: parsed.locationMapLink ?? null,
    bookingReference: parsed.bookingReference ?? null,
    expenseAmount: parsed.expenseAmount ?? null,
    expenseCurrency: parsed.expenseCurrency ?? null,
    expensePaymentStatus: parsed.expensePaymentStatus ?? null,
    expensePaymentNote: parsed.expensePaymentNote ?? null,
    contactName: parsed.contactName ?? null,
    contactPhone: parsed.contactPhone ?? null,
    contactEmail: parsed.contactEmail ?? null,
    notes: parsed.notes ?? null,
    postTripNotes: parsed.postTripNotes ?? null,
    // Default to `{}` here (create only) -- the per-type schemas deliberately
    // don't `.default({})` this field so the *update* path (below) can tell
    // "omitted" (leave untouched) apart from "explicitly empty".
    typeDetails: (parsed.typeDetails ?? {}) as Prisma.InputJsonValue,
    // spec-guest-access: defaulted here (create only), same "Route Handler
    // layer defaults it" convention as every other optional field -- the DB
    // column also carries `@default(false)` (Boundaries: "defaults to false
    // on every existing and new TimelineEntry row"), so this is belt-and-
    // suspenders, not the only place the default is enforced.
    isPrivate: parsed.isPrivate ?? false,
  };
}

/**
 * Builds a `prisma.timelineEntry.update` `data` object -- only fields that
 * were actually present in the PATCH body are included, so an omitted
 * field is left untouched (Prisma treats an absent key, not `undefined`
 * explicitly, as "don't touch"; explicit `null` still clears it).
 */
export function toEntryUpdateData(parsed: ParsedEntryFields) {
  return {
    ...(parsed.title !== undefined && { title: parsed.title }),
    ...(parsed.description !== undefined && { description: parsed.description }),
    ...(parsed.subtype !== undefined && { subtype: parsed.subtype as EntrySubtype }),
    ...(parsed.startAt !== undefined && { startAt: parsed.startAt }),
    ...(parsed.endAt !== undefined && { endAt: parsed.endAt }),
    ...(parsed.locationName !== undefined && { locationName: parsed.locationName }),
    ...(parsed.locationAddress !== undefined && { locationAddress: parsed.locationAddress }),
    ...(parsed.locationLat !== undefined && { locationLat: parsed.locationLat }),
    ...(parsed.locationLng !== undefined && { locationLng: parsed.locationLng }),
    ...(parsed.locationMapLink !== undefined && { locationMapLink: parsed.locationMapLink }),
    ...(parsed.bookingReference !== undefined && { bookingReference: parsed.bookingReference }),
    ...(parsed.expenseAmount !== undefined && { expenseAmount: parsed.expenseAmount }),
    ...(parsed.expenseCurrency !== undefined && { expenseCurrency: parsed.expenseCurrency }),
    ...(parsed.expensePaymentStatus !== undefined && {
      expensePaymentStatus: parsed.expensePaymentStatus,
    }),
    ...(parsed.expensePaymentNote !== undefined && { expensePaymentNote: parsed.expensePaymentNote }),
    ...(parsed.contactName !== undefined && { contactName: parsed.contactName }),
    ...(parsed.contactPhone !== undefined && { contactPhone: parsed.contactPhone }),
    ...(parsed.contactEmail !== undefined && { contactEmail: parsed.contactEmail }),
    ...(parsed.notes !== undefined && { notes: parsed.notes }),
    ...(parsed.postTripNotes !== undefined && { postTripNotes: parsed.postTripNotes }),
    ...(parsed.typeDetails !== undefined && {
      typeDetails: parsed.typeDetails as Prisma.InputJsonValue,
    }),
    // spec-guest-access: same "only touch what was actually present in the
    // PATCH body" pattern as every other field here -- an omitted
    // `isPrivate` leaves the stored flag untouched, never silently resets
    // it to `false`.
    ...(parsed.isPrivate !== undefined && { isPrivate: parsed.isPrivate }),
  };
}

/**
 * PATCH's per-type start/end ordering check (FR-11/FR-12/FR-13), applied
 * after merging a partial update onto the existing row's stored values --
 * same "merge before checking order" pattern as Section/Trip PATCH, so a
 * one-field PATCH can never invert the pair. Returns an error message, or
 * `null` when the merged pair is valid (including "no end at all", which
 * is always valid for Note and an untouched Activity).
 */
export function mergedDateOrderError(
  entryType: CreatableEntryType,
  startAt: Date,
  endAt: Date | null,
): string | null {
  if (endAt === null) return null;
  if (entryType === 'STAY') {
    return isDateTimeOrderValid(startAt, endAt) ? null : 'Check-out must be later than check-in';
  }
  if (entryType === 'TRANSPORT') {
    return isDateTimeOrderValid(startAt, endAt) ? null : 'Arrival must be later than departure';
  }
  if (entryType === 'ACTIVITY') {
    return isDateTimeOrderValid(startAt, endAt, { allowEqual: true })
      ? null
      : 'End must be on or after the start';
  }
  return null; // NOTE and BLOG_POST never have an endAt (no schema field for it).
}

/**
 * An Entry whose start/end falls outside its parent Trip's own date range
 * is accepted (201/200) but then never rendered anywhere on the Timeline --
 * `layoutTimelineEntries` (lib/timeline.ts) defensively drops any day index
 * it can't find, i.e. this becomes silently-invisible data. Reject it
 * cleanly at the API boundary instead, in both the Trip's own timezone (a
 * calendar-day comparison, same convention as buildTimelineDays/
 * layoutTimelineEntries) -- called with the *merged* start/end on PATCH, same
 * "merge before checking" pattern as `mergedDateOrderError` above.
 */
export function entryOutsideTripRangeError(
  trip: { startDate: Date; endDate: Date; timezone: string },
  startAt: Date,
  endAt: Date | null,
): string | null {
  const tripStartKey = dateKeyOfDateColumn(trip.startDate);
  const tripEndKey = dateKeyOfDateColumn(trip.endDate);

  const startKey = dateKeyInTimezone(startAt, trip.timezone);
  if (startKey < tripStartKey || startKey > tripEndKey) {
    return `Start must fall within the Trip's dates (${tripStartKey} to ${tripEndKey})`;
  }
  if (endAt) {
    const endKey = dateKeyInTimezone(endAt, trip.timezone);
    if (endKey < tripStartKey || endKey > tripEndKey) {
      return `End must fall within the Trip's dates (${tripStartKey} to ${tripEndKey})`;
    }
  }
  return null;
}
