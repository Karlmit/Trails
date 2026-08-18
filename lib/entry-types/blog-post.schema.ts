import { z } from 'zod';
import { dateTimeField } from '@/lib/validation';
import { isPrivateField, titleField } from './shared-fields.schema';

// A Blog Post's own content is BlockNote's serialized Block[] JSON (see
// components/RichTextEditor.tsx), not the plain prose the shared
// `descriptionField` (max 5000) is sized for -- embedded images/formatting
// marks make the JSON representation far larger than the visible text, so
// this type gets its own, much larger cap rather than sharing that field.
const blogPostDescriptionField = z.string().trim().max(200_000).optional().nullable();

// FR-18: "A User can create a Blog Post with title, content, a required
// associated date ... A new Blog Post starts in Draft state." Per the
// spec's Code Map this is the minimal shape -- title, description (the
// Blog Post's content body), and startAt (the required associated date)
// only. No subtype, Location, Expense, booking reference, or Contact
// Information -- Intent is explicit that Blog Post carries none of those
// (distinct from Note, which still keeps Contact per FR-15). `.strict()`
// matches every other entry-type schema: an unrecognized field (most
// importantly `publishedAt` -- see the I/O matrix row "Attempt to set
// publishedAt via the normal edit form") 400s instead of being silently
// dropped or accepted. `publishedAt` is deliberately never a field on this
// schema at all -- the only way to change it is the dedicated publish/
// unpublish action (app/api/v1/timeline-entries/[entryId]/publish), which
// writes the column directly, never through this create/update path
// (AD-10, Boundaries: "published_at is never client-settable through the
// normal create/edit form").
const blogPostFieldsShape = {
  title: titleField,
  description: blogPostDescriptionField,
  startAt: dateTimeField,
  isPrivate: isPrivateField,
};

export const blogPostFieldsSchema = z.object(blogPostFieldsShape).strict();

export const blogPostCreateSchema = z
  .object({ tripId: z.string().uuid('tripId must be a valid UUID'), ...blogPostFieldsShape })
  .strict();

export const blogPostUpdateSchema = blogPostFieldsSchema.partial();
