'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EntryForm, type EntryDTO } from '@/components/EntryForm';
import { AttachmentList } from '@/components/AttachmentList';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery, type PhotoDTO } from '@/components/PhotoGallery';
import { ENTRY_TYPE_LABELS, subtypeLabel } from '@/lib/entry-types/labels';
import { entryTypeColor } from '@/lib/entry-types/colors';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

// FR-11-FR-15: view/edit/delete a single Entry. Same view<->edit toggle
// pattern as TripOverviewPanel/EditTripForm, plus an inline delete action
// (DeleteTripButton's pattern) rather than three separate components, since
// this panel is only ever mounted on the one Entry detail page.
export function EntryDetailPanel({
  tripId,
  entry: initialEntry,
  readOnly = false,
  photos,
}: {
  tripId: string;
  entry: EntryDTO;
  // spec-guest-access: hides Edit/Delete (and the AttachmentList's
  // upload/delete affordances) entirely for a Guest -- not merely disabled,
  // not present in the DOM at all.
  readOnly?: boolean;
  // spec-tags-links-photos: server-fetched, already `filterForViewer`-
  // filtered Photos (app/(web)/trips/[tripId]/entries/[entryId]/page.tsx) --
  // required for a Guest, whose session-less browser can't self-fetch
  // GET /api/v1/photos. See PhotoGallery's own `initialPhotos` comment.
  photos?: PhotoDTO[];
}) {
  const router = useRouter();
  const [entry, setEntry] = useState(initialEntry);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/timeline-entries/${entry.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this Entry.');
        return;
      }
      router.push(`/trips/${tripId}/timeline`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (editing && !readOnly) {
    return (
      <EntryForm
        tripId={tripId}
        mode="edit"
        entry={entry}
        onSaved={(updated) => {
          setEntry(updated);
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
          <div>
            <span
              className="badge"
              style={{ background: entryTypeColor(entry.entryType), color: '#fff' }}
            >
              {ENTRY_TYPE_LABELS[entry.entryType]}
            </span>
            {entry.subtype && (
              <span className="text-soft" style={{ marginLeft: 'var(--space-2)' }}>
                {subtypeLabel(entry.subtype)}
              </span>
            )}
          </div>
          {!readOnly && (
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>

        <h2 style={{ margin: 0 }}>{entry.title}</h2>
        {entry.description && (
          <p className="text-soft text-multiline" style={{ margin: 0 }}>
            {entry.description}
          </p>
        )}

        <dl className="row" style={{ gap: 'var(--space-6)' }}>
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {entry.entryType === 'TRANSPORT' ? 'Departure' : entry.entryType === 'STAY' ? 'Check-in' : 'Start'}
            </dt>
            <dd style={{ margin: 0 }}>{new Date(entry.startAt).toLocaleString()}</dd>
          </div>
          {entry.endAt && (
            <div>
              <dt className="text-soft" style={FIELD_LABEL_STYLE}>
                {entry.entryType === 'TRANSPORT' ? 'Arrival' : entry.entryType === 'STAY' ? 'Check-out' : 'End'}
              </dt>
              <dd style={{ margin: 0 }}>{new Date(entry.endAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>

        {(entry.locationName || entry.locationAddress) && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Location
            </dt>
            <dd style={{ margin: 0 }}>
              {[entry.locationName, entry.locationAddress].filter(Boolean).join(' — ')}
              {entry.locationMapLink && (
                <>
                  {' '}
                  <a href={entry.locationMapLink} target="_blank" rel="noreferrer">
                    Open map
                  </a>
                </>
              )}
            </dd>
          </div>
        )}

        {entry.bookingReference && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Booking reference
            </dt>
            <dd style={{ margin: 0 }}>{entry.bookingReference}</dd>
          </div>
        )}

        {entry.expenseAmount != null && entry.expenseCurrency && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Expense
            </dt>
            <dd style={{ margin: 0 }}>
              {entry.expenseAmount} {entry.expenseCurrency}
              {entry.expensePaymentStatus ? ` · ${entry.expensePaymentStatus}` : ''}
            </dd>
          </div>
        )}

        {(entry.contactName || entry.contactPhone || entry.contactEmail) && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Contact
            </dt>
            <dd style={{ margin: 0 }}>
              {[entry.contactName, entry.contactPhone, entry.contactEmail].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}

        {entry.notes && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Notes
            </dt>
            <dd className="text-multiline" style={{ margin: 0 }}>{entry.notes}</dd>
          </div>
        )}

        {entry.postTripNotes && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              Post-Trip Notes
            </dt>
            <dd className="text-multiline" style={{ margin: 0 }}>{entry.postTripNotes}</dd>
          </div>
        )}

        {!readOnly && <TagList ownerType="TIMELINE_ENTRY" ownerId={entry.id} />}
        {!readOnly && <LinkList ownerType="TIMELINE_ENTRY" ownerId={entry.id} />}
        <PhotoGallery
          tripId={tripId}
          ownerType="TIMELINE_ENTRY"
          ownerId={entry.id}
          readOnly={readOnly}
          initialPhotos={photos}
        />

        <AttachmentList tripId={tripId} ownerType="TIMELINE_ENTRY" ownerId={entry.id} readOnly={readOnly} />
      </div>
    </div>
  );
}
