import { z } from 'zod';
import { dateTimeField, entryTimezoneField, isDateTimeOrderValid } from '@/lib/validation';
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

// FR-12: Transport's "mode" is this spec's Entry Subtype for the type.
export const TRANSPORT_MODES = [
  'FLIGHT',
  'TRAIN',
  'FERRY',
  'BUS',
  'CAR',
  'TAXI',
  'TRANSFER',
  'TRANSPORT_OTHER',
] as const;

// AD-1: type-only fields for Transport, validated by exactly this schema.
const transportTypeDetailsSchema = z
  .object({
    terminal: z.string().trim().max(100).optional().nullable(),
    gate: z.string().trim().max(50).optional().nullable(),
    platform: z.string().trim().max(50).optional().nullable(),
    serviceNumber: z.string().trim().max(100).optional().nullable(),
    seat: z.string().trim().max(50).optional().nullable(),
    baggageInfo: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const transportFieldsShape = {
  title: titleField,
  description: descriptionField,
  subtype: z.enum(TRANSPORT_MODES, {
    message: `subtype must be one of: ${TRANSPORT_MODES.join(', ')}`,
  }),
  // Departure/arrival datetime (FR-12) map onto the shared startAt/endAt
  // pair (AD-1). Location here is the single shared AD-11 Location -- see
  // the code comment in lib/entry-types/shared-fields.schema.ts.
  startAt: dateTimeField,
  endAt: dateTimeField,
  // spec-timeline-ux-and-timezone (correction): NULL (default) means
  // startAt/endAt above are literal digits, no real timezone attached at
  // all (dateTimeField's comment) -- exactly like every other type. Set
  // only when departure and arrival airports are in different real
  // timezones; the Route Handler (not this schema) applies it, since the
  // order check below needs a real, correctly-computed instant to compare
  // (a long-haul flight can land at a literal clock time earlier than it
  // departed).
  startTimezone: entryTimezoneField,
  endTimezone: entryTimezoneField,
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
  typeDetails: transportTypeDetailsSchema.optional(),
};

// `.strict()` matches Note's schema (lib/entry-types/note.schema.ts): an
// unexpected/misspelled field must 400 for every type, not be silently
// stripped the way plain `z.object(...)` does.
export const transportFieldsSchema = z.object(transportFieldsShape).strict();

export const transportCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...transportFieldsShape })
  .strict()
  // spec-timeline-ux-and-timezone (correction): skipped whenever either leg
  // declares a real timezone -- startAt/endAt are still the naive,
  // pre-conversion digits at this point, so a same-schema comparison can't
  // tell a genuinely-invalid pair from a perfectly normal long-haul flight
  // whose arrival *local clock time* reads earlier than its departure's.
  // The Route Handler re-checks order itself (mergedDateOrderError) after
  // applying startTimezone/endTimezone, once real instants exist to compare.
  .refine((data) => (data.startTimezone || data.endTimezone ? true : isDateTimeOrderValid(data.startAt, data.endAt)), {
    message: 'Arrival must be later than departure',
    path: ['endAt'],
  })
  .refine(hasExpensePair, {
    message: 'Expense requires both an amount and a currency',
    path: ['expenseCurrency'],
  });

export const transportUpdateSchema = transportFieldsSchema.partial();
