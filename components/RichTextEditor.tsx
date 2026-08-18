'use client';

import '@blocknote/mantine/style.css';
import { useMemo, useRef, useState, type ChangeEvent, type MutableRefObject } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, type PartialBlock } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import {
  createReactBlockSpec,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

// User-reported: "look online for an easy way to integrate a ready made
// WYSIWYG editor for blog posts ... a way to even choose if text is next to
// an image or if the image is just above/below the text." BlockNote's own
// built-in `image` block (registered below, unmodified) already covers
// "add images" end to end (upload/drag-drop/paste/resize) -- this file adds
// exactly one custom block, `layoutImage`, on top of it, solely for the
// side-by-side option: a real CSS float, which is not something a Notion-
// style block editor (including real Notion) does for its own built-in
// image block at all.
const layoutImageBlock = createReactBlockSpec(
  {
    type: 'layoutImage',
    propSchema: {
      url: { default: '' },
      layout: {
        default: 'block',
        values: ['block', 'float-left', 'float-right'],
      },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [uploading, setUploading] = useState(false);
      const fileInputRef = useRef<HTMLInputElement>(null);
      // Threaded down from RichTextEditor's own closure via module state is
      // not safe across multiple editors on one page -- read straight off
      // the editor instance instead, stashed there by RichTextEditor below
      // (BlockNote has no first-class "arbitrary app data" slot, but every
      // block's render function already receives the live `editor`).
      const postId: string | null = (editor as unknown as { _blogPostId: string | null })._blogPostId;

      async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !postId) return;
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('ownerType', 'TIMELINE_ENTRY');
          formData.append('ownerId', postId);
          formData.append('file', file);
          const response = await fetch('/api/v1/photos', { method: 'POST', body: formData });
          const photo = await response.json().catch(() => null);
          if (response.ok && photo?.id) {
            editor.updateBlock(block, { props: { ...block.props, url: `/api/v1/photos/${photo.id}/file` } });
          }
        } finally {
          setUploading(false);
        }
      }

      function setLayout(layout: 'block' | 'float-left' | 'float-right') {
        editor.updateBlock(block, { props: { ...block.props, layout } });
      }

      if (!block.props.url) {
        // RichTextView (the read-only detail-page renderer) shares this
        // same custom block for display parity -- an empty placeholder
        // with an "add image"/"save first" prompt would be actively
        // misleading there, since editing isn't possible at all. Render
        // nothing instead, the same way a Guest sees no upload affordance
        // anywhere else in the app.
        if (!editor.isEditable) return null;
        return (
          <div className="rte-layout-image-placeholder" contentEditable={false}>
            {postId ? (
              <>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : '🖼️ Add image with text wrap'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
              </>
            ) : (
              <span className="text-soft">Save this post first, then edit it to add images.</span>
            )}
          </div>
        );
      }

      return (
        <div className={`rte-layout-image rte-layout-image-${block.props.layout}`}>
          {editor.isEditable && (
            <div className="rte-layout-image-toolbar" contentEditable={false}>
              <button
                type="button"
                aria-pressed={block.props.layout === 'float-left'}
                onClick={() => setLayout('float-left')}
              >
                ⬅ Left
              </button>
              <button type="button" aria-pressed={block.props.layout === 'block'} onClick={() => setLayout('block')}>
                ⬛ Center
              </button>
              <button
                type="button"
                aria-pressed={block.props.layout === 'float-right'}
                onClick={() => setLayout('float-right')}
              >
                ➡ Right
              </button>
            </div>
          )}
          <img src={block.props.url} alt="" />
        </div>
      );
    },
  },
);

export const blogPostSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    layoutImage: layoutImageBlock(),
  },
});

const EMPTY_DOCUMENT: PartialBlock[] = [{ type: 'paragraph', content: '' }];

/**
 * A Blog Post's `description` predates this editor and was plain prose
 * (BlogPostForm's old `<textarea>`) -- every existing post's stored value is
 * that plain string, not BlockNote's Block[] JSON this editor now produces.
 * Rather than a one-off DB migration, this is detected and upgraded lazily,
 * the moment the User re-opens/re-saves a post: valid JSON matching the
 * expected shape is used as-is, anything else (including `null`/empty) is
 * treated as a single legacy paragraph.
 */
export function parseBlogContent(raw: string | null | undefined): PartialBlock[] {
  if (!raw) return EMPTY_DOCUMENT;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Not JSON -- a legacy plain-text post, fall through.
  }
  return [{ type: 'paragraph', content: raw }];
}

function useBlogEditor(initialContent: string | null | undefined, postId: string | null) {
  // BlockNote's own `initialContent` is read once at creation time -- fine
  // here since both Forms that use this only ever mount once per Blog Post
  // (create page vs. edit page are separate mounts, never the same instance
  // switching content underneath itself).
  const editor = useCreateBlockNote({
    schema: blogPostSchema,
    initialContent: useMemo(() => parseBlogContent(initialContent), [initialContent]),
  });
  // Stashed for layoutImageBlock's render function above -- see its comment.
  (editor as unknown as { _blogPostId: string | null })._blogPostId = postId;
  return editor;
}

export function RichTextEditor({
  initialContent,
  contentRef,
  postId,
}: {
  initialContent: string | null | undefined;
  // Deliberately a ref, not React state fed back in as a `value` prop --
  // BlockNote (like every other ProseMirror/contentEditable-based editor)
  // is uncontrolled: it owns its own document. Round-tripping every
  // keystroke through the parent's own state (which would then re-render
  // and hand a "new" content prop back down) fought the editor's internal
  // update cycle badly enough to blow React's nested-update-depth limit
  // (caught live: typing a sentence crashed the whole form). Mutating a
  // ref on change instead means the parent never re-renders from typing at
  // all -- BlogPostForm reads `.current` only once, at submit time.
  contentRef: MutableRefObject<string>;
  // null in create mode (the Blog Post doesn't exist yet, so there's no
  // owner for an uploaded image to attach to -- same constraint the
  // existing PhotoGallery already has, see BlogPostForm.tsx). Once the
  // first save happens and the User re-opens this post to edit it, images
  // become available.
  postId: string | null;
}) {
  const editor = useBlogEditor(initialContent, postId);

  return (
    <div className="rich-text-editor">
      <BlockNoteView
        editor={editor}
        theme="light"
        slashMenu={false}
        onChange={() => {
          contentRef.current = JSON.stringify(editor.document);
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: 'Image with text wrap',
                  subtext: 'An image that text can flow beside, left or right',
                  aliases: ['image', 'photo', 'picture', 'float'],
                  group: 'Media',
                  icon: <span aria-hidden="true">🖼️</span>,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'layoutImage' }),
                },
              ],
              query,
            )
          }
        />
      </BlockNoteView>
    </div>
  );
}

export function RichTextView({ content }: { content: string | null | undefined }) {
  const editor = useCreateBlockNote({
    schema: blogPostSchema,
    initialContent: useMemo(() => parseBlogContent(content), [content]),
  });

  return (
    <div className="rich-text-view">
      <BlockNoteView editor={editor} theme="light" editable={false} />
    </div>
  );
}
