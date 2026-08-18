import { z } from 'zod';
import { dateTimeField, isDateTimeOrderValid } from '@/lib/validation';
import {
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
} from './shared-fields.schema';

// FR-11: Entry Subtype is strictly type-specific -- this is the exact set a
// Stay may take (the `entry_subtype` DB enum also holds Transport/Activity
// values, but only these can pass this schema).
export const STAY_SUBTYPES = [
  'HOTEL',
  'HOSTEL',
  'RESORT',
  'APARTMENT',
  'VILLA',
  'GUESTHOUSE',
  'STAY_OTHER',
] as const;

// AD-1: type-only fields for Stay, validated by exactly this schema.
const stayTypeDetailsSchema = z
  .object({
    roomInfo: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const stayFieldsShape = {
  title: titleField,
  description: descriptionField,
  subtype: z.enum(STAY_SUBTYPES, {
    message: `subtype must be one of: ${STAY_SUBTYPES.join(', ')}`,
  }),
  startAt: dateTimeField,
  endAt: dateTimeField,
  ...locationFields,
  bookingReference: bookingReferenceField,
  ...expenseFields,
  ...contactFields,
  notes: notesField,
  postTripNotes: postTripNotesField,
  isPrivate: isPrivateField,
  // No `.default({})` here deliberately: `stayUpdateSchema` below is this
  // same shape run through `.partial()`, and a PATCH that omits
  // `typeDetails` must leave the stored JSONB untouched, not overwrite it
  // with `{}`. Defaulting to `{}` on create happens in the Route Handler
  // instead (app/api/v1/timeline-entries/route.ts), not in this schema.
  typeDetails: stayTypeDetailsSchema.optional(),
};

// `.strict()` matches Note's schema (lib/entry-types/note.schema.ts): an
// unexpected/misspelled field must 400 for every type, not be silently
// stripped the way plain `z.object(...)` does.
export const stayFieldsSchema = z.object(stayFieldsShape).strict();

export const stayCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...stayFieldsShape })
  .strict()
  .refine((data) => isDateTimeOrderValid(data.startAt, data.endAt), {
    message: 'Check-out must be later than check-in',
    path: ['endAt'],
  })
  .refine(hasExpensePair, {
    message: 'Expense requires both an amount and a currency',
    path: ['expenseCurrency'],
  });

export const stayUpdateSchema = stayFieldsSchema.partial();
