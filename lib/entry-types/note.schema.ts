import { z } from 'zod';
import { dateTimeField } from '@/lib/validation';
import {
  contactFields,
  descriptionField,
  isPrivateField,
  notesField,
  postTripNotesField,
  titleField,
} from './shared-fields.schema';

// FR-14: "A Note requires only a date and text content -- no Location,
// Expense, or booking reference fields are shown for this type." `.strict()`
// below makes sending any of those fields for a Note a clean 400 instead of
// a silently-ignored write, matching the I/O matrix row exactly ("Title +
// date only" in, "no booking/expense fields shown" out). No `subtype`
// either -- FR-14 defines no Entry Subtype for Note.
//
// FR-15's Contact Information capability is shared by every TimelineEntry
// type, Note included -- only booking-reference and Expense are FR-14's
// Note exclusions, so `contactFields` (unlike locationFields/expenseFields)
// is spread in below.
const noteTypeDetailsSchema = z.object({}).strict();

const noteFieldsShape = {
  title: titleField,
  description: descriptionField,
  startAt: dateTimeField,
  ...contactFields,
  notes: notesField,
  postTripNotes: postTripNotesField,
  isPrivate: isPrivateField,
  // See stay.schema.ts's comment: no `.default({})` here so a PATCH that
  // omits `typeDetails` doesn't overwrite the stored JSONB with `{}`.
  typeDetails: noteTypeDetailsSchema.optional(),
};

export const noteFieldsSchema = z.object(noteFieldsShape).strict();

export const noteCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...noteFieldsShape })
  .strict();

export const noteUpdateSchema = noteFieldsSchema.partial();
