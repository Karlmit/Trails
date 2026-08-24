'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AttachmentList } from '@/components/AttachmentList';
import { ImportantInfoForm } from '@/components/ImportantInfoForm';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

export interface ImportantInfoDTO {
  id: string;
  tripId: string;
  title: string;
  content: string | null;
  emoji: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isPrivate: boolean;
  sortOrder: number;
  // spec-tags-links-photos: same Cover Photo id shape as IdeaCard's
  // primaryPhotoId (see that component's comment) --
  // app/(web)/trips/[tripId]/important-info/page.tsx attaches this.
  primaryPhotoId?: string | null;
}

// FR-26, spec-important-info: view/edit/delete a single ImportantInfo item,
// same view<->edit toggle pattern as EntryDetailPanel (edit mode swaps in
// ImportantInfoForm), plus a single-request `isPrivate` toggle with no
// confirm dialog (spec's I/O matrix -- same optimistic-toggle,
// in-flight-guard shape as ChecklistCard's item-checked toggle). A mounted
// AttachmentList (ownerType="IMPORTANT_INFO") covers Attachments.
export function ImportantInfoCard({
  item: initialItem,
  isFirst,
  isLast,
}: {
  item: ImportantInfoDTO;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingPrivate, setTogglingPrivate] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTogglePrivate() {
    if (togglingPrivate) return;
    setError(null);
    const nextPrivate = !item.isPrivate;
    setTogglingPrivate(true);
    // Optimistic update, same pattern as ChecklistCard's item toggle.
    setItem((current) => ({ ...current, isPrivate: nextPrivate }));

    try {
      const response = await fetch(`/api/v1/important-info/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrivate: nextPrivate }),
      });

      if (!response.ok) {
        setItem((current) => ({ ...current, isPrivate: !nextPrivate }));
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not update this item.');
        return;
      }

      router.refresh();
    } catch {
      setItem((current) => ({ ...current, isPrivate: !nextPrivate }));
      setError('Could not reach the server. Please try again.');
    } finally {
      setTogglingPrivate(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/important-info/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this item.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // User-requested manual reordering -- a lightweight list-level action,
  // available directly from the view row rather than requiring Edit.
  async function handleMove(direction: 'up' | 'down') {
    if (moving) return;
    setMoving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/important-info/${item.id}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not reorder this item.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setMoving(false);
    }
  }

  if (editing) {
    return (
      <ImportantInfoForm
        tripId={item.tripId}
        mode="edit"
        item={item}
        onSaved={(updated) => {
          setItem(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    // User-requested compactness: tighter padding/gap than the default
    // `.card`/`.stack` -- the main win is A3's hide-when-empty Tags/Links/
    // Documents/Photos, this is a modest additional pass on top of that.
    <div className="card stack" style={{ padding: 'var(--space-3)', gap: 'var(--space-2)' }}>
      {error && <div className="form-error-banner">{error}</div>}

      <div className="row-between">
        <h3 style={{ margin: 0 }}>
          {item.emoji || '📌'} {item.title}
        </h3>
        <div className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <div className="row" style={{ gap: 0 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleMove('up')}
              disabled={moving || isFirst}
              aria-label="Move up"
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleMove('down')}
              disabled={moving || isLast}
              aria-label="Move down"
              title="Move down"
            >
              ↓
            </button>
          </div>
          <label className="row" style={{ gap: 'var(--space-1)', alignItems: 'center', margin: 0 }}>
            <input
              type="checkbox"
              checked={item.isPrivate}
              onChange={handleTogglePrivate}
              disabled={togglingPrivate}
              aria-label="Private"
            />
            <span className="text-soft">Private</span>
          </label>
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {item.primaryPhotoId && (
        <Image
          src={`/api/v1/photos/${item.primaryPhotoId}/file`}
          alt=""
          width={80}
          height={80}
          className="card-cover-photo"
          // See components/PhotoGallery.tsx's identical comment.
          unoptimized
        />
      )}

      {item.content && <p className="text-soft text-multiline" style={{ margin: 0 }}>{item.content}</p>}

      {(item.locationName || item.locationAddress) && (
        <div>
          <dt className="text-soft" style={FIELD_LABEL_STYLE}>
            Location
          </dt>
          <dd style={{ margin: 0 }}>
            {[item.locationName, item.locationAddress].filter(Boolean).join(' — ')}
            {item.locationMapLink && (
              <>
                {' '}
                <a href={item.locationMapLink} target="_blank" rel="noreferrer">
                  Open map
                </a>
              </>
            )}
          </dd>
        </div>
      )}

      {(item.contactName || item.contactPhone || item.contactEmail) && (
        <div>
          <dt className="text-soft" style={FIELD_LABEL_STYLE}>
            Contact
          </dt>
          <dd style={{ margin: 0 }}>
            {[item.contactName, item.contactPhone, item.contactEmail].filter(Boolean).join(' · ')}
          </dd>
        </div>
      )}

      <TagList ownerType="IMPORTANT_INFO" ownerId={item.id} readOnly />
      <LinkList ownerType="IMPORTANT_INFO" ownerId={item.id} readOnly />
      <PhotoGallery tripId={item.tripId} ownerType="IMPORTANT_INFO" ownerId={item.id} readOnly />
      <AttachmentList tripId={item.tripId} ownerType="IMPORTANT_INFO" ownerId={item.id} readOnly />
    </div>
  );
}
