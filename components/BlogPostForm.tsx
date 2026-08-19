'use client';

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';

// BlockNote (RichTextEditor.tsx) touches `window` during its own render,
// so it can't tolerate this Client Component's own server-render pass --
// `ssr: false` defers it to mount entirely client-side, same fix every
// other browser-only editor library (Monaco, etc.) needs in the App Router.
const RichTextEditor = dynamic(() => import('@/components/RichTextEditor').then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className="rich-text-editor-loading text-soft">Loading editor…</div>,
});

export interface BlogPostDTO {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
  startAt: string;
  publishedAt: string | null;
  isPrivate: boolean;
  // spec-tags-links-photos: same Cover Photo id shape as IdeaCard's
  // primaryPhotoId -- app/(web)/trips/[tripId]/blog/page.tsx attaches this.
  // Optional/absent on the detail page's own DTO (BlogPostDetailPanel
  // renders the full PhotoGallery instead, via its separate `photos` prop).
  primaryPhotoId?: string | null;
}

interface BlogPostFormProps {
  tripId: string;
  mode: 'create' | 'edit';
  post?: BlogPostDTO;
  // User-reported: "the check-in defaulted to the trips start date" for
  // other Entry Types (EntryForm.tsx) but Blog Posts were never given the
  // same default -- a create-mode form with no seed opens its date picker
  // on the Trip's own first day, same as everywhere else.
  tripStartDate?: string;
  // User-reported: "I would like the blog content editor to be a full page
  // experience" -- this form now always lives on its own dedicated route
  // (app/(web)/trips/[tripId]/blog/new and .../[entryId]/edit), never
  // swapped in inline over an existing panel, so Cancel is a plain
  // navigation back to wherever launched it rather than a callback that
  // toggles a parent's local state.
  cancelHref: string;
}

// spec-blog, FR-18: create/edit form for a Blog Post -- deliberately minimal
// (title, content, one required date), matching blog-post.schema.ts's shape
// exactly. No subtype/Location/Expense/booking/Contact fields (Intent:
// "no location/expense/booking/contact"), and no `publishedAt` field
// anywhere on this form -- that's the dedicated Publish/Unpublish action's
// job alone (AD-10; see components/BlogPostDetailPanel.tsx), never this
// create/edit path.
//
// User-reported: "we do not need a time for blog posts, only date" -- unlike
// every other Entry Type, a Blog Post's own `startAt` is edited as a bare
// `YYYY-MM-DD` via a native date input, never a time. `dateTimeField`
// (lib/validation.ts) already accepts a bare date -- parsed as literal UTC
// midnight, the same "no specific time" sentinel every other type's
// optional-time fields already use -- so this needed no backend change.
function toDateOnly(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function BlogPostForm({ tripId, mode, post, tripStartDate, cancelHref }: BlogPostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? '');
  // A ref, not state -- see RichTextEditor's `contentRef` prop comment for
  // why round-tripping every keystroke through this component's own state
  // (and back down as RichTextEditor's prop) broke the editor outright.
  const descriptionRef = useRef(post?.description ?? '');
  const [startAt, setStartAt] = useState(
    post?.startAt ? toDateOnly(post.startAt) : mode === 'create' ? (tripStartDate ?? '') : '',
  );
  // spec-guest-access (FR-28): defaults to `false`, same as the DB column.
  const [isPrivate, setIsPrivate] = useState(post?.isPrivate ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // User-reported: "Would it be possible to allow uploading images to a
  // blog post before its actually saved? ... feels unnesseary" to require
  // a save first. A ref, not state -- `ensurePostId` (passed to
  // RichTextEditor) needs to read/write this synchronously, and a second
  // concurrent call (e.g. two images added in quick succession before any
  // re-render happens) must see the *in-flight* create, not fire a second
  // one -- see `creatingRef` below. In edit mode this is just the post's
  // own id from the start, so `ensurePostId` never has anything to create.
  const existingIdRef = useRef<string | null>(post?.id ?? null);
  const creatingRef = useRef<Promise<string> | null>(null);

  async function ensurePostId(): Promise<string> {
    if (existingIdRef.current) return existingIdRef.current;
    if (creatingRef.current) return creatingRef.current;

    const promise = (async () => {
      const body: Record<string, unknown> = {
        tripId,
        entryType: 'BLOG_POST',
        // A blank title can't be saved at all (FR-18) -- but blocking the
        // very first image on "type a title first" would just trade one
        // annoyance for another. Same "Untitled" convention as Google
        // Docs/Notion: silently fills in a placeholder the User can
        // rename any time before Publishing (nothing here is published
        // yet -- this is still always a Draft).
        title: title.trim() || 'Untitled',
        description: descriptionRef.current || null,
        startAt: startAt || tripStartDate || toDateOnly(new Date().toISOString()),
        isPrivate,
      };
      const response = await fetch('/api/v1/timeline-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseBody?.error?.message ?? 'Could not create this Blog Post.');
      }
      existingIdRef.current = responseBody.id;
      return responseBody.id as string;
    })();

    creatingRef.current = promise;
    try {
      return await promise;
    } finally {
      creatingRef.current = null;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!startAt) {
      // FR-18 Consequence: "cannot be saved without an associated date; the
      // system rejects the save and prompts for one rather than defaulting
      // silently to today's date."
      setError('An associated date is required.');
      return;
    }

    // An image upload may already have lazily created this Draft (see
    // ensurePostId above) -- if so, this is an update to that same row,
    // not a second, duplicate post.
    const id = existingIdRef.current;
    const body: Record<string, unknown> = {
      title,
      description: descriptionRef.current || null,
      // A bare `YYYY-MM-DD` -- see toDateOnly's comment.
      startAt,
      isPrivate,
    };
    if (!id) {
      body.tripId = tripId;
      body.entryType = 'BLOG_POST';
    }

    setSubmitting(true);
    try {
      const url = id ? `/api/v1/timeline-entries/${id}` : '/api/v1/timeline-entries';
      const method = id ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error?.message ?? 'Could not save this Blog Post.');
        return;
      }

      router.push(`/trips/${tripId}/blog/${responseBody.id}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="blog-editor-form">
      {error && <div className="form-error-banner">{error}</div>}

      <input
        className="blog-editor-title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        aria-label="Title"
        required
      />

      <input
        className="blog-editor-date-input"
        type="date"
        value={startAt}
        onChange={(e) => setStartAt(e.target.value)}
        aria-label="Date"
        required
      />

      <RichTextEditor initialContent={descriptionRef.current} contentRef={descriptionRef} ensurePostId={ensurePostId} />

      <div className="blog-editor-footer">
        <label className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Private (hidden from Guests)
        </label>

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'create' ? 'Save Draft' : 'Save changes'}
          </button>
          <Link href={cancelHref} className="btn btn-dark-outline">
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
