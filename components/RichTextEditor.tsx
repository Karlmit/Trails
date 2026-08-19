'use client';

import '@blocknote/mantine/style.css';
import { useMemo, useRef, useState, type ChangeEvent, type MutableRefObject } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, type PartialBlock } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import {
  createReactBlockSpec,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useActiveStyles,
  useCreateBlockNote,
  useEditorState,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

// User-reported: "look online for an easy way to integrate a ready made
// WYSIWYG editor for blog posts ... a way to even choose if text is next to
// an image or if the image is just above/below the text," and later "ensure
// that the blog editor allows for uploading images."
//
// This is the ONE AND ONLY image block registered below -- BlockNote's own
// built-in `image` block is deliberately NOT included in the schema
// (verified live: it has an upstream bug where the block's own persistent
// "Loading..." placeholder never clears if `uploadFile` rejects -- e.g.
// every time a User tries to add an image before the post's first save --
// even though the upload dialog's own transient UI correctly resets after
// 3s. Rather than special-case around a third-party bug, this custom block
// is the app's single image block: it upload/resizes and, uniquely, offers
// the layout choice, all with its own correctly-scoped local loading/error
// state instead of BlockNote's buggy global upload tracker.
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
      const [uploadError, setUploadError] = useState<string | null>(null);
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
        if (!file || !editor.uploadFile) return;
        setUploading(true);
        setUploadError(null);
        try {
          const url = await editor.uploadFile(file);
          if (typeof url === 'string') {
            editor.updateBlock(block, { props: { ...block.props, url } });
          }
        } catch {
          setUploadError('Could not upload this image. Please try again.');
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
                <button
                  type="button"
                  className="rte-layout-image-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : '🖼️ Add image'}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
                {uploadError && <div className="field-error">{uploadError}</div>}
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

// `image` is deliberately omitted -- see layoutImageBlock's own comment
// above for why this app never registers BlockNote's built-in one.
const { image: _unusedDefaultImageBlock, ...blockSpecsWithoutDefaultImage } = defaultBlockSpecs;
export const blogPostSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...blockSpecsWithoutDefaultImage,
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

// User-reported: "ensure that the blog editor allows for uploading images"
// -- this was the actual gap: `uploadFile` was never wired onto the editor
// itself, so BlockNote's own built-in `image` block (the discoverable
// "Image" slash-menu item, plus drag-drop and clipboard paste, none of
// which go through layoutImageBlock's own bespoke upload button above) had
// no working upload path at all -- only the custom block did. Shared by
// both: `layoutImageBlock`'s render calls `editor.uploadFile` directly
// instead of duplicating this fetch.
async function uploadBlogImage(file: File, postId: string | null): Promise<string> {
  if (!postId) {
    // Mirrors layoutImageBlock's own "Save this post first" message --
    // BlockNote's built-in File Panel renders whatever this throws via its
    // own `.bn-error-text` (UploadTab.tsx), so this string is User-facing.
    throw new Error('Save this post first, then edit it to add images.');
  }
  const formData = new FormData();
  formData.append('ownerType', 'TIMELINE_ENTRY');
  formData.append('ownerId', postId);
  formData.append('file', file);
  const response = await fetch('/api/v1/photos', { method: 'POST', body: formData });
  const photo = await response.json().catch(() => null);
  if (!response.ok || !photo?.id) {
    throw new Error(photo?.error?.message ?? 'Could not upload this image.');
  }
  return `/api/v1/photos/${photo.id}/file`;
}

function useBlogEditor(initialContent: string | null | undefined, postId: string | null) {
  // BlockNote's own `initialContent`/`uploadFile` are read once at creation
  // time -- fine here since both Forms that use this only ever mount once
  // per Blog Post (create page vs. edit page are separate mounts, and
  // `postId` is invariant for a given mount's whole lifetime -- create mode
  // never flips to having one without a full page navigation to the detail
  // page first).
  const editor = useCreateBlockNote({
    schema: blogPostSchema,
    initialContent: useMemo(() => parseBlogContent(initialContent), [initialContent]),
    uploadFile: (file) => uploadBlogImage(file, postId),
  });
  // Stashed for layoutImageBlock's render function above -- see its comment.
  (editor as unknown as { _blogPostId: string | null })._blogPostId = postId;
  return editor;
}

type BlogEditor = ReturnType<typeof useBlogEditor>;

// User-reported: "On mobile the plus icon to add an image is outside the
// screen. The notion like editor is probably good on desktop. But on
// phones it kinda sucks since the menu moves. Its probably better to add
// a menu on top that is typical for WYSIWYG editors." BlockNote's own
// side menu (the "+"/drag-handle column to the left of each block) is
// fundamentally mouse-hover-positioned -- confirmed in its own source,
// it repositions on `mousemove` -- which has no equivalent on a touch
// screen and, on a narrow phone viewport with no left margin to render
// into, the button ends up positioned off-screen. Rather than trying to
// fix hover-only positioning for touch, this is a plain, always-visible
// toolbar (no selection or hover needed to appear) sitting above the
// editable area on every device -- the same "typical WYSIWYG editor"
// shape as Google Docs/Word's own persistent top toolbar. The one
// mobile-only affordance the side menu uniquely offered (dividers,
// quotes, tables, drag-reorder) is still reachable via "/" -- confirmed
// live that slash commands work fine on a touch screen -- so nothing is
// lost by hiding the broken side menu there (see `.bn-side-menu`'s own
// mobile media query in globals.css).
function BlogToolbar({ editor }: { editor: BlogEditor }) {
  const activeStyles = useActiveStyles(editor);
  const currentBlock = useEditorState({
    editor,
    selector: ({ editor }) => (editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block])[0],
  });

  function toggleStyle(style: 'bold' | 'italic') {
    editor.focus();
    editor.toggleStyles({ [style]: true });
  }

  function toggleBlockType(type: string, props?: Record<string, unknown>) {
    editor.focus();
    const props_ = (currentBlock.props ?? {}) as Record<string, unknown>;
    const isActive =
      currentBlock.type === type && (!props || Object.entries(props).every(([k, v]) => props_[k] === v));
    editor.updateBlock(currentBlock, isActive ? { type: 'paragraph', props: {} } : ({ type, props } as never));
  }

  function insertImage() {
    editor.focus();
    insertOrUpdateBlockForSlashMenu(editor, { type: 'layoutImage' } as never);
  }

  const blockProps = (currentBlock.props ?? {}) as Record<string, unknown>;
  const isHeading = (level: number) => currentBlock.type === 'heading' && blockProps.level === level;

  return (
    <div className="blog-toolbar" role="toolbar" aria-label="Formatting">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={!!activeStyles.bold}
        onClick={() => toggleStyle('bold')}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={!!activeStyles.italic}
        onClick={() => toggleStyle('italic')}
      >
        <em>I</em>
      </button>
      <span className="blog-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="Heading"
        aria-pressed={isHeading(2)}
        onClick={() => toggleBlockType('heading', { level: 2 })}
      >
        H2
      </button>
      <button
        type="button"
        aria-label="Subheading"
        aria-pressed={isHeading(3)}
        onClick={() => toggleBlockType('heading', { level: 3 })}
      >
        H3
      </button>
      <span className="blog-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="Bullet list"
        aria-pressed={currentBlock.type === 'bulletListItem'}
        onClick={() => toggleBlockType('bulletListItem')}
      >
        ⋮≡
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        aria-pressed={currentBlock.type === 'numberedListItem'}
        onClick={() => toggleBlockType('numberedListItem')}
      >
        1.
      </button>
      <span className="blog-toolbar-divider" aria-hidden="true" />
      <button type="button" aria-label="Insert image" onClick={insertImage}>
        🖼️
      </button>
    </div>
  );
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
      <BlogToolbar editor={editor} />
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
                  title: 'Image',
                  subtext: 'Upload a photo -- can flow beside text, or sit above/below it',
                  aliases: ['image', 'photo', 'picture', 'upload', 'float'],
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
