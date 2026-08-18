import { describe, expect, it } from 'vitest';
import { isTagOwnerType, tagCreateSchema, TAG_OWNER_TYPES, tagTextField } from '@/lib/tags';

// FR-15/FR-16/FR-26, spec-tags-links-photos: pure Zod schema/helper tests,
// same split as tests/attachments.test.ts.

describe('TAG_OWNER_TYPES / isTagOwnerType', () => {
  it('is exactly the AD-4 owner-type subset for Tag/Link/Photo (unlike Attachment, includes IDEA)', () => {
    expect(TAG_OWNER_TYPES).toEqual(['TIMELINE_ENTRY', 'IDEA', 'IMPORTANT_INFO']);
    for (const type of TAG_OWNER_TYPES) {
      expect(isTagOwnerType(type)).toBe(true);
    }
  });

  it('rejects an unknown owner type', () => {
    expect(isTagOwnerType('CHECKLIST')).toBe(false);
    expect(isTagOwnerType('')).toBe(false);
  });
});

describe('tagTextField (I/O matrix: empty/over-length text -> 400)', () => {
  it('accepts non-empty text within bounds', () => {
    expect(tagTextField.safeParse('Rainy day').success).toBe(true);
  });

  it('rejects empty text', () => {
    expect(tagTextField.safeParse('').success).toBe(false);
    expect(tagTextField.safeParse('   ').success).toBe(false);
  });

  it('rejects text over 50 characters', () => {
    expect(tagTextField.safeParse('a'.repeat(51)).success).toBe(false);
    expect(tagTextField.safeParse('a'.repeat(50)).success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = tagTextField.safeParse('  hiking  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('hiking');
  });
});

describe('tagCreateSchema', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';

  it('accepts a valid TIMELINE_ENTRY tag', () => {
    const result = tagCreateSchema.safeParse({ ownerType: 'TIMELINE_ENTRY', ownerId, text: 'Beach' });
    expect(result.success).toBe(true);
  });

  it('accepts IDEA as an owner type (unlike Attachment)', () => {
    const result = tagCreateSchema.safeParse({ ownerType: 'IDEA', ownerId, text: 'Maybe' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid ownerType', () => {
    const result = tagCreateSchema.safeParse({ ownerType: 'CHECKLIST', ownerId, text: 'Beach' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed ownerId', () => {
    const result = tagCreateSchema.safeParse({ ownerType: 'IDEA', ownerId: 'not-a-uuid', text: 'Beach' });
    expect(result.success).toBe(false);
  });
});
