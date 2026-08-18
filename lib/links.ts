import { z } from 'zod';

// FR-15/FR-16/FR-26, spec-tags-links-photos, AD-4: Link CRUD. Same
// pure-schema-plus-helpers split as lib/tags.ts.

// Same AD-4 owner-type subset as Tag/Photo (TimelineEntry | Idea |
// ImportantInfo) -- see lib/tags.ts's TAG_OWNER_TYPES comment for why this
// is duplicated per table rather than shared: each table's Route Handler
// validates its own allowed subset independently at the application layer.
export const LINK_OWNER_TYPES = ['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO'] as const;
export type LinkOwnerType = (typeof LINK_OWNER_TYPES)[number];

export function isLinkOwnerType(value: string): value is LinkOwnerType {
  return (LINK_OWNER_TYPES as readonly string[]).includes(value);
}

// I/O matrix: "Add a Link -- Valid http(s) URL, optional label -- 201 ...
// `javascript:`/`data:` URI -> 400, same scheme check as locationMapLink."
// Identical validation shape to
// lib/entry-types/shared-fields.schema.ts's locationMapLinkField -- a bare
// `.url()` still accepts `javascript:`/`data:` URIs, and this value is
// rendered as a clickable `<a href>` verbatim (components/LinkList.tsx), so
// an unvalidated value here is a stored-XSS-shaped gap. Unlike
// locationMapLink, this field is required (a Link with no URL is
// meaningless), not optional/nullable.
export const linkUrlField = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048)
  .refine(
    (value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: 'Link must be a valid http(s) URL' },
  );

export const linkLabelField = z.string().trim().max(200).optional().nullable();

export const linkCreateSchema = z.object({
  ownerType: z.enum(LINK_OWNER_TYPES, { message: `ownerType must be one of: ${LINK_OWNER_TYPES.join(', ')}` }),
  ownerId: z.string().uuid('ownerId must be a valid UUID'),
  url: linkUrlField,
  label: linkLabelField,
});
