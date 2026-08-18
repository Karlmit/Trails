'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';

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
  onSaved?: (post: BlogPostDTO) => void;
  onCancel?: () => void;
}

// spec-blog, FR-18: create/edit form for a Blog Post -- deliberately minimal
// (title, content, one required date), matching blog-post.schema.ts's shape
// exactly. No subtype/Location/Expense/booking/Contact fields (Intent:
// "no location/expense/booking/contact"), and no `publishedAt` field
// anywhere on this form -- that's the dedicated Publish/Unpublish action's
// job alone (AD-10; see components/BlogPostDetailPanel.tsx), never this
// create/edit path.
//
// `startAt` is an Entry's own recorded time (see dateTimeField's comment)
// -- read back with UTC getters, never local ones, so the pre-filled value
// is always the literal digits originally typed, regardless of which
// browser/timezone is doing the editing.
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function BlogPostForm({ tripId, mode, post, tripStartDate, onSaved, onCancel }: BlogPostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? '');
  const [startAt, setStartAt] = useState(
    post?.startAt ? toDateTimeLocal(post.startAt) : mode === 'create' ? (tripStartDate ?? '') : '',
  );
  // spec-guest-access (FR-28): defaults to `false`, same as the DB column.
  const [isPrivate, setIsPrivate] = useState(post?.isPrivate ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

    const body: Record<string, unknown> = {
      title,
      description: description || null,
      // Sent as the raw `YYYY-MM-DDTHH:mm` literal -- see EntryForm.tsx's
      // matching comment for why `new Date(startAt).toISOString()` would
      // silently corrupt it via the submitting browser's own timezone.
      startAt,
      isPrivate,
    };

    if (mode === 'create') {
      body.tripId = tripId;
      body.entryType = 'BLOG_POST';
    }

    setSubmitting(true);
    try {
      const url =
        mode === 'create' ? '/api/v1/timeline-entries' : `/api/v1/timeline-entries/${post!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

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

      if (mode === 'create') {
        router.push(`/trips/${tripId}/blog/${responseBody.id}`);
      } else {
        onSaved?.(responseBody);
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="blog-title">Title</label>
        <input id="blog-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="field">
        <label htmlFor="blog-date">Date</label>
        {/* User-reported: not using 24-hour clock, and not matching the
            same date-picker settings as the rest of the app -- swapped
            from a native `datetime-local` (which formats AM/PM-vs-24h from
            the browser's OS locale, with no reliable override) to the same
            DateTimeInput every other Entry Type uses. `timeRequired={false}`
            matches "Check-in/out time should not be mandatory": a bare
            date is a complete, valid value here too. */}
        <DateTimeInput id="blog-date" value={startAt} onChange={setStartAt} required timeRequired={false} />
      </div>

      <div className="field">
        <label htmlFor="blog-content">Content</label>
        <textarea
          id="blog-content"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
        />
      </div>

      <div className="field">
        <label htmlFor="blog-is-private" className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            id="blog-is-private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Private (hidden from Guests)
        </label>
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Save Draft' : 'Save changes'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-dark-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
