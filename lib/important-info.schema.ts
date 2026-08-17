import { z } from 'zod';
import { contactFields, locationFields } from '@/lib/entry-types/shared-fields.schema';

// FR-26, spec-important-info: ImportantInfo CRUD, mirroring
// lib/validation.ts's Checklist/Idea schema shape (a single flat schema, no
// AD-1-style discriminator -- ImportantInfo has only one shape). `.strict()`
// so an unlisted field (spec's "Ask First" boundary -- nothing beyond
// title/content/Contact/Location/isPrivate) is rejected as a 400 rather than
// silently ignored.

const importantInfoFieldsShape = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  // Longer free-text field, same bound as TimelineEntry's notes/description
  // (rendered with `white-space: pre-wrap` via the shared `.text-multiline`
  // class -- see components/ImportantInfoCard.tsx).
  content: z.string().trim().max(5000).optional().nullable(),
  // AD-11: Important Info is one of AD-11's Location-owning rows -- same
  // shape/validation as TimelineEntry/Idea's Location fields, reused
  // directly rather than redefined.
  ...locationFields,
  // Contact Information (FR-26) -- same shape as TimelineEntry's Contact
  // fields, reused directly.
  ...contactFields,
  // FR-26: stored and toggleable, no read-time enforcement (see
  // spec-important-info.md's disclosed "isPrivate" note).
  isPrivate: z.boolean().optional(),
};

export const importantInfoFieldsSchema = z.object(importantInfoFieldsShape).strict();

export const importantInfoCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...importantInfoFieldsShape })
  .strict();

export const importantInfoUpdateSchema = importantInfoFieldsSchema.partial();
