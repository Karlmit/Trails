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

// User-requested redesign: every leg of the journey -- including the
// first -- is one uniform Flight, instead of a full-fields "first flight"
// plus bare-bones "stopovers" for the rest. The entry's own top-level
// startAt/endAt/startTimezone/endTimezone (below) are computed by the
// *client* from flights[0].departureAt and flights[last].arrivalAt (and
// their timezones) -- this schema doesn't need to know that; it just
// validates the flights array and the (unchanged) top-level pair
// separately. A "stopover" is no longer entered data at all -- it's the
// display of the gap between one flight's arrival and the next flight's
// departure, computed client-side at render time. Not FLIGHT-only: trains/
// buses can have connections too.
//
// `departureAt`/`arrivalAt` deliberately stay plain validated strings, NOT
// `dateTimeField` -- that transforms to a real `Date`, and this whole
// object round-trips through `typeDetails` (a schemaless Json column,
// lib/entry-types/index.ts's `parsed.typeDetails as Prisma.InputJsonValue`
// cast, no runtime serialization step of its own) rather than a real
// Prisma column, so a nested Date here would be an untested edge case for
// no benefit -- every other typeDetails field is already a plain string.
const flightDateTimeField = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Must be a valid date/time',
});

const transportFlightLegSchema = z
  .object({
    departureLocation: z.string().trim().max(200).optional().nullable(),
    departureAt: flightDateTimeField,
    departureTimezone: entryTimezoneField,
    arrivalLocation: z.string().trim().max(200).optional().nullable(),
    arrivalAt: flightDateTimeField,
    arrivalTimezone: entryTimezoneField,
    flightNumber: z.string().trim().max(100).optional().nullable(),
    terminal: z.string().trim().max(100).optional().nullable(),
    gate: z.string().trim().max(50).optional().nullable(),
    platform: z.string().trim().max(50).optional().nullable(),
    seat: z.string().trim().max(50).optional().nullable(),
  })
  .strict()
  // Same relaxation as transportCreateSchema's own order check below: skip
  // whenever this leg declares a real timezone on either end, since a
  // long-haul flight's literal arrival clock time can read earlier than
  // its departure's.
  .refine(
    (data) => (data.departureTimezone || data.arrivalTimezone ? true : new Date(data.arrivalAt).getTime() > new Date(data.departureAt).getTime()),
    {
      message: 'Arrival must be later than departure',
      path: ['arrivalAt'],
    },
  );

// AD-1: type-only fields for Transport, validated by exactly this schema.
const transportTypeDetailsSchema = z
  .object({
    baggageInfo: z.string().trim().max(500).optional().nullable(),
    // No realistic itinerary needs more than this many legs.
    flights: z.array(transportFlightLegSchema).min(1, 'At least one flight is required').max(10),
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
