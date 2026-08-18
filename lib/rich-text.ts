interface RawInlineContent {
  text?: string;
}

interface RawBlock {
  content?: RawInlineContent[] | string;
  children?: RawBlock[];
}

/**
 * BlogPostCard's list-view excerpt needs plain prose, not BlockNote's own
 * Block[] JSON (RichTextEditor.tsx) that `description` is actually stored
 * as -- slicing the raw JSON string itself (the pre-editor behavior) would
 * show a garbled blob of `{"type":"paragraph"...}` on the Blog list page.
 * Deliberately dependency-free (no `@blocknote/core` import) so this stays
 * safe to call from a plain Server Component without pulling the editor's
 * client bundle along -- it only needs to read `content`/`children`, the
 * same two keys every Block shape (including this app's own custom
 * `layoutImage`) already carries.
 */
export function extractPlainText(raw: string | null | undefined): string {
  if (!raw) return '';
  let blocks: RawBlock[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return raw;
    blocks = parsed;
  } catch {
    // Not JSON -- a legacy plain-text post (predates this editor).
    return raw;
  }

  const parts: string[] = [];
  const walk = (list: RawBlock[]) => {
    for (const block of list) {
      if (typeof block.content === 'string') {
        parts.push(block.content);
      } else if (Array.isArray(block.content)) {
        for (const inline of block.content) {
          if (typeof inline.text === 'string') parts.push(inline.text);
        }
      }
      if (block.children?.length) walk(block.children);
    }
  };
  walk(blocks);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
