import { describe, expect, it } from 'vitest';
import { extractPlainText } from '@/lib/rich-text';

// BlogPostCard's list-view excerpt needs plain prose out of BlockNote's own
// Block[] JSON (components/RichTextEditor.tsx) -- these lock in that the
// raw JSON structure never leaks into the rendered excerpt, and that a
// legacy plain-text post (predating this editor) still round-trips as-is.
describe('extractPlainText', () => {
  it('returns an empty string for null/undefined/empty input', () => {
    expect(extractPlainText(null)).toBe('');
    expect(extractPlainText(undefined)).toBe('');
    expect(extractPlainText('')).toBe('');
  });

  it('returns a legacy plain-text post unchanged', () => {
    expect(extractPlainText('Landed and explored the old town.')).toBe('Landed and explored the old town.');
  });

  it('concatenates inline text across paragraph blocks', () => {
    const raw = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'First line.', styles: {} }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second line.', styles: {} }] },
    ]);
    expect(extractPlainText(raw)).toBe('First line. Second line.');
  });

  it('skips image blocks with no text content', () => {
    const raw = JSON.stringify([
      { type: 'paragraph', content: [{ type: 'text', text: 'Before the image.', styles: {} }] },
      { type: 'layoutImage', props: { url: '/api/v1/photos/abc/file', layout: 'float-left' }, content: undefined },
      { type: 'paragraph', content: [{ type: 'text', text: 'After the image.', styles: {} }] },
    ]);
    expect(extractPlainText(raw)).toBe('Before the image. After the image.');
  });

  it('recurses into nested children', () => {
    const raw = JSON.stringify([
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Parent item.', styles: {} }],
        children: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested detail.', styles: {} }] }],
      },
    ]);
    expect(extractPlainText(raw)).toBe('Parent item. Nested detail.');
  });

  it('collapses excess whitespace', () => {
    const raw = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: '  spaced   out  ', styles: {} }] }]);
    expect(extractPlainText(raw)).toBe('spaced out');
  });
});
