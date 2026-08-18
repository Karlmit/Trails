'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BlogPostForm, type BlogPostDTO } from '@/components/BlogPostForm';
import { AttachmentList } from '@/components/AttachmentList';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery, type PhotoDTO } from '@/components/PhotoGallery';
import { formatEntryDateTime } from '@/lib/trip-status';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

// FR-18/FR-19: view/edit/publish/unpublish/delete a single Blog Post. Same
// view<->edit toggle + inline-delete shape as EntryDetailPanel
// (components/EntryDetailPanel.tsx); Publish/Unpublish are the two
// additional actions this Entry Type has that no other type does, each a
// single PUT/DELETE to the dedicated publish route (never through this
// panel's own PATCH/DELETE calls, and never a field this panel's edit form
// can touch -- AD-10).
export function BlogPostDetailPanel({
  tripId,
  post: initialPost,
  readOnly = false,
  photos,
}: {
  tripId: string;
  post: BlogPostDTO;
  // spec-guest-access: hides Publish/Unpublish/Edit/Delete (and the
  // AttachmentList's upload/delete affordances) entirely for a Guest.
  readOnly?: boolean;
  // spec-tags-links-photos: server-fetched, already `filterForViewer`-
  // filtered Photos (app/(web)/trips/[tripId]/blog/[entryId]/page.tsx) --
  // see EntryDetailPanel's identical prop for why this is required for a
  // Guest.
  photos?: PhotoDTO[];
}) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublished = post.publishedAt !== null;

  async function handlePublishToggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/timeline-entries/${post.id}/publish`, {
        method: isPublished ? 'DELETE' : 'PUT',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? `Could not ${isPublished ? 'unpublish' : 'publish'} this Blog Post.`);
        return;
      }
      setPost(body);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/timeline-entries/${post.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this Blog Post.');
        return;
      }
      router.push(`/trips/${tripId}/blog`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (editing && !readOnly) {
    return (
      <BlogPostForm
        tripId={tripId}
        mode="edit"
        post={post}
        onSaved={(updated) => {
          setPost(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="stack">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="card stack">
        <div className="row-between">
          <span className={`badge ${isPublished ? 'badge-published' : 'badge-draft'}`}>
            {isPublished ? 'Published' : 'Draft'}
          </span>
          {!readOnly && (
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-primary" onClick={handlePublishToggle} disabled={busy}>
                {busy ? 'Working…' : isPublished ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>

        <h2 style={{ margin: 0 }}>{post.title}</h2>

        <dl style={{ margin: 0 }}>
          <dt className="text-soft" style={FIELD_LABEL_STYLE}>
            Date
          </dt>
          <dd style={{ margin: 0 }}>{formatEntryDateTime(post.startAt)}</dd>
        </dl>

        {post.description && (
          <dl style={{ margin: 0 }}>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Content
            </dt>
            <dd className="text-multiline" style={{ margin: 0 }}>
              {post.description}
            </dd>
          </dl>
        )}

        {isPublished && (
          <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
            Published {new Date(post.publishedAt as string).toLocaleString()} · visible on the Timeline
          </p>
        )}

        {!readOnly && <TagList ownerType="TIMELINE_ENTRY" ownerId={post.id} />}
        {!readOnly && <LinkList ownerType="TIMELINE_ENTRY" ownerId={post.id} />}
        <PhotoGallery
          tripId={tripId}
          ownerType="TIMELINE_ENTRY"
          ownerId={post.id}
          readOnly={readOnly}
          initialPhotos={photos}
        />

        {!readOnly && (
          <AttachmentList tripId={tripId} ownerType="TIMELINE_ENTRY" ownerId={post.id} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}
