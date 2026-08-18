import { z } from 'zod';

// AD-1/FR-15: field pieces shared across every TimelineEntry Entry Type's
// own Zod schema (lib/entry-types/{type}.schema.ts) -- defined once here so
// no per-type schema infers or redefines this shape independently.
//
// FR-14 overrides FR-15's blanket "every type supports ... Expense" for
// Note specifically (its own consequence: "no Location, Expense, or
// booking reference fields ... for this type" -- confirmed by the I/O
// matrix row "no booking/expense fields shown"). lib/entry-types/note.schema.ts
// therefore does not spread locationFields/expenseFields/bookingReferenceField
// in below -- those exports exist only for Stay/Transport/Activity.

export const titleField = z.string().trim().min(1, 'Title is required').max(200);
export const descriptionField = z.string().trim().max(5000).optional().nullable();
export const notesField = z.string().trim().max(5000).optional().nullable();
export const postTripNotesField = z.string().trim().max(5000).optional().nullable();
export const bookingReferenceField = z.string().trim().max(200).optional().nullable();

// spec-guest-access (FR-28/AD-10): shared across all 5 entry-type schemas
// (Stay/Transport/Activity/Note/BlogPost) -- unlike most other shared
// fields, this one is never withheld for Note or BlogPost (both still get a
// Guest-eligible detail page, so both need a way to be hidden from Guests).
// Optional, not defaulted here -- same "default at the Route Handler layer"
// convention as every other optional field (lib/entry-types/index.ts's
// toEntryCreateData), so a PATCH that omits it leaves the stored value
// untouched (this field is not nullable, only omittable).
export const isPrivateField = z.boolean().optional();

// A bare `.url()` still accepts `javascript:`/`data:` URIs -- this field is
// rendered as a clickable `<a href>` verbatim (components/EntryDetailPanel.tsx),
// so an unvalidated value here is a stored-XSS-shaped gap. Require both "is a
// well-formed URL" and "scheme is http/https" explicitly.
const locationMapLinkField = z
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
    { message: 'Map link must be a valid http(s) URL' },
  );

// AD-11: Location is always embedded plain columns, never a shared entity
// -- one Location per row (Stay/Transport/Activity; withheld for Note).
export const locationFields = {
  locationName: z.string().trim().max(200).optional().nullable(),
  locationAddress: z.string().trim().max(500).optional().nullable(),
  locationLat: z.number().min(-90).max(90).optional().nullable(),
  locationLng: z.number().min(-180).max(180).optional().nullable(),
  locationMapLink: locationMapLinkField,
};

// Contact Information (FR-15) -- shared across every type, Note included.
export const contactFields = {
  contactName: z.string().trim().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  contactEmail: z.string().trim().max(200).optional().nullable(),
};

// Expense (FR-22): "requires both an amount and a currency to be saved;
// negative amounts are rejected" -- amount/currency travel together or not
// at all, checked by refineExpensePair below (withheld for Note, FR-14).
export const expenseFields = {
  // DB column is `Decimal(12,2)` (max 9,999,999,999.99) -- bounded here too
  // so an out-of-range value 400s cleanly instead of failing unhandled at
  // the Postgres/Prisma layer.
  expenseAmount: z
    .number()
    .nonnegative('Expense amount cannot be negative')
    .max(9999999999.99, 'Expense amount is too large')
    .optional()
    .nullable(),
  expenseCurrency: z
    .string()
    .trim()
    .length(3, 'Currency must be a 3-letter code (e.g. USD)')
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  expensePaymentStatus: z.string().trim().max(50).optional().nullable(),
  expensePaymentNote: z.string().trim().max(1000).optional().nullable(),
};

export function hasExpensePair(data: {
  expenseAmount?: number | null;
  expenseCurrency?: string | null;
}): boolean {
  const hasAmount = data.expenseAmount !== undefined && data.expenseAmount !== null;
  const hasCurrency = data.expenseCurrency !== undefined && data.expenseCurrency !== null;
  return hasAmount === hasCurrency;
}

/**
 * FR-22: `expensePaymentStatus`/`expensePaymentNote` are meaningless without
 * an Expense amount+currency pair -- mutates `parsed` in place to null both
 * out whenever the *effective* (i.e. possibly PATCH-merged) amount/currency
 * pair is absent, so clearing an Expense (or never having set one) can never
 * leave an orphaned payment status/note behind. Called only after
 * `hasExpensePair` has already confirmed the pair is either both-present or
 * both-absent, so this just needs to branch on that one remaining case.
 */
export function clearOrphanedExpenseDependents(
  parsed: { expensePaymentStatus?: string | null; expensePaymentNote?: string | null },
  effective: { expenseAmount: number | null; expenseCurrency: string | null },
): void {
  if (effective.expenseAmount !== null || effective.expenseCurrency !== null) return;
  parsed.expensePaymentStatus = null;
  parsed.expensePaymentNote = null;
}
