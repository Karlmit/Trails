import { z } from 'zod';
import { dateTimeField, isDateTimeOrderValid } from '@/lib/validation';
import {
  bookedViaField,
  bookingReferenceField,
  contactFields,
  descriptionField,
  expenseFields,
  hasExpensePair,
  isPrivateField,
  locationFields,
  notesField,
  postTripNotesField,
  titleField,
  websiteField,
} from './shared-fields.schema';

// FR-13: Entry Subtype for Activity.
export const ACTIVITY_SUBTYPES = [
  'TOUR',
  'RESTAURANT',
  'ATTRACTION',
  'EVENT',
  'BEACH',
  'HIKE',
  'MUSEUM',
  'SHOPPING',
  'NIGHTLIFE',
  'ACTIVITY_OTHER',
] as const;

// Activity has no type-only fields beyond subtype (FR-13 lists none), but
// keeps a strict empty schema so a stray key in `typeDetails` is a clean
// 400 rather than silently stored.
const activityTypeDetailsSchema = z.object({}).strict();

const activityFieldsShape = {
  title: titleField,
  description: descriptionField,
  subtype: z.enum(ACTIVITY_SUBTYPES, {
    message: `subtype must be one of: ${ACTIVITY_SUBTYPES.join(', ')}`,
  }),
  startAt: dateTimeField,
  // FR-13: unlike Stay/Transport, an Activity's end may be omitted
  // (single point-in-time) or equal to its start.
  endAt: dateTimeField.optional().nullable(),
  ...locationFields,
  // spec-entry-fields-datepickers: same override as stay.schema.ts -- see
  // its comment. locationFields itself stays untouched.
  locationName: z
    .string({ required_error: 'Location name is required' })
    .trim()
    .min(1, 'Location name is required')
    .max(200),
  bookingReference: bookingReferenceField,
  website: websiteField,
  bookedVia: bookedViaField,
  ...expenseFields,
  ...contactFields,
  notes: notesField,
  postTripNotes: postTripNotesField,
  isPrivate: isPrivateField,
  // See stay.schema.ts's comment: no `.default({})` here so a PATCH that
  // omits `typeDetails` doesn't overwrite the stored JSONB with `{}`.
  typeDetails: activityTypeDetailsSchema.optional(),
};

// `.strict()` matches Note's schema (lib/entry-types/note.schema.ts): an
// unexpected/misspelled field must 400 for every type, not be silently
// stripped the way plain `z.object(...)` does.
export const activityFieldsSchema = z.object(activityFieldsShape).strict();

export const activityCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...activityFieldsShape })
  .strict()
  .refine(
    (data) => !data.endAt || isDateTimeOrderValid(data.startAt, data.endAt, { allowEqual: true }),
    { message: 'End must be on or after the start', path: ['endAt'] },
  )
  .refine(hasExpensePair, {
    message: 'Expense requires both an amount and a currency',
    path: ['expenseCurrency'],
  });

export const activityUpdateSchema = activityFieldsSchema.partial();
