import { describe, expect, it } from 'vitest';
import { isLinkOwnerType, linkCreateSchema, LINK_OWNER_TYPES, linkUrlField } from '@/lib/links';

// FR-15/FR-16/FR-26, spec-tags-links-photos: pure Zod schema/helper tests.

describe('LINK_OWNER_TYPES / isLinkOwnerType', () => {
  it('is exactly the AD-4 owner-type subset (matches TAG_OWNER_TYPES)', () => {
    expect(LINK_OWNER_TYPES).toEqual(['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO']);
  });

  it('rejects an unknown owner type', () => {
    expect(isLinkOwnerType('ATTACHMENT')).toBe(false);
  });
});

describe('linkUrlField (I/O matrix: javascript:/data: URI -> 400, same scheme check as locationMapLink)', () => {
  it('accepts http and https URLs', () => {
    expect(linkUrlField.safeParse('http://example.com').success).toBe(true);
    expect(linkUrlField.safeParse('https://example.com/booking?id=1').success).toBe(true);
  });

  it('rejects a javascript: URI', () => {
    expect(linkUrlField.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('rejects a data: URI', () => {
    expect(linkUrlField.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(linkUrlField.safeParse('not a url').success).toBe(false);
  });

  it('rejects an empty URL (required, unlike locationMapLink)', () => {
    expect(linkUrlField.safeParse('').success).toBe(false);
  });
});

describe('linkCreateSchema', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';

  it('accepts a valid Link with an optional label', () => {
    const result = linkCreateSchema.safeParse({
      ownerType: 'IMPORTANT_INFO',
      ownerId,
      url: 'https://example.com',
      label: 'Booking confirmation',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a Link with no label', () => {
    const result = linkCreateSchema.safeParse({ ownerType: 'IDEA', ownerId, url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects an unsafe scheme end to end', () => {
    const result = linkCreateSchema.safeParse({ ownerType: 'IDEA', ownerId, url: 'javascript:alert(1)' });
    expect(result.success).toBe(false);
  });
});
