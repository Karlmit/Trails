import { z } from 'zod';

// FR-15/FR-16/FR-26, spec-tags-links-photos, AD-4: Tag CRUD -- one row per
// free-text label (spec's "Tags scope, disclosed": "not a JSON array
// column"). Pure, DB-free Zod schema + small helpers, unit-tested, same
// split as lib/attachments.ts's pure helpers vs. the Route Handler that
// touches Prisma.

// AD-4's Rule: "owner_type is one of TimelineEntry | Idea | ImportantInfo"
// -- Tag/Link/Photo all support the full set (unlike Attachment, which
// deliberately excludes IDEA per FR-16). Each table's Route Handler
// validates this same subset independently at the application layer (the
// shared `polymorphic_owner_type` DB enum doesn't weaken that).
export const TAG_OWNER_TYPES = ['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO'] as const;
export type TagOwnerType = (typeof TAG_OWNER_TYPES)[number];

export function isTagOwnerType(value: string): value is TagOwnerType {
  return (TAG_OWNER_TYPES as readonly string[]).includes(value);
}

// I/O matrix: "Add a Tag -- Valid text -- 201 ... Empty/over-length text ->
// 400." Same trim+bounds convention as every other free-text field in this
// codebase (e.g. TimelineEntry.title).
export const tagTextField = z.string().trim().min(1, 'Tag text is required').max(50, 'Tag text is too long');

export const tagCreateSchema = z.object({
  ownerType: z.enum(TAG_OWNER_TYPES, { message: `ownerType must be one of: ${TAG_OWNER_TYPES.join(', ')}` }),
  ownerId: z.string().uuid('ownerId must be a valid UUID'),
  text: tagTextField,
});
