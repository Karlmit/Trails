'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AttachmentList } from '@/components/AttachmentList';
import { ImportantInfoForm } from '@/components/ImportantInfoForm';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

export interface ImportantInfoDTO {
  id: string;
  tripId: string;
  title: string;
  content: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isPrivate: boolean;
}

// FR-26, spec-important-info: view/edit/delete a single ImportantInfo item,
// same view<->edit toggle pattern as EntryDetailPanel (edit mode swaps in
// ImportantInfoForm), plus a single-request `isPrivate` toggle with no
// confirm dialog (spec's I/O matrix -- same optimistic-toggle,
// in-flight-guard shape as ChecklistCard's item-checked toggle). A mounted
// AttachmentList (ownerType="IMPORTANT_INFO") covers Attachments.
export function ImportantInfoCard({ item: initialItem }: { item: ImportantInfoDTO }) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingPrivate, setTogglingPrivate] = useState(false);
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
    <div className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="row-between">
        <h3 style={{ margin: 0 }}>{item.title}</h3>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
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

      <AttachmentList tripId={item.tripId} ownerType="IMPORTANT_INFO" ownerId={item.id} />
    </div>
  );
}
