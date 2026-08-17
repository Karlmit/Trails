'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ImportantInfoDTO } from '@/components/ImportantInfoCard';

interface ImportantInfoFormProps {
  tripId: string;
  mode: 'create' | 'edit';
  item?: ImportantInfoDTO;
  onSaved?: (item: ImportantInfoDTO) => void;
  onCancel?: () => void;
}

// FR-26, spec-important-info: create + edit an ImportantInfo item in one
// component (same dual-mode shape as EntryForm, since -- unlike
// ChecklistForm/IdeaForm, which only ever create -- this spec's I/O matrix
// requires a genuine "Edit an item" path too). Create mode manages its own
// toggle-open state (ChecklistForm's pattern); edit mode is controlled by
// its parent (ImportantInfoCard), same as EntryForm mounted from
// EntryDetailPanel.
export function ImportantInfoForm({ tripId, mode, item, onSaved, onCancel }: ImportantInfoFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(mode === 'edit');
  const [title, setTitle] = useState(item?.title ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [locationName, setLocationName] = useState(item?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(item?.locationAddress ?? '');
  const [locationMapLink, setLocationMapLink] = useState(item?.locationMapLink ?? '');
  const [contactName, setContactName] = useState(item?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(item?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(item?.contactEmail ?? '');
  const [isPrivate, setIsPrivate] = useState(item?.isPrivate ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle('');
    setContent('');
    setLocationName('');
    setLocationAddress('');
    setLocationMapLink('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setIsPrivate(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      title,
      content: content || null,
      locationName: locationName || null,
      locationAddress: locationAddress || null,
      locationMapLink: locationMapLink || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      isPrivate,
    };

    try {
      const response =
        mode === 'create'
          ? await fetch('/api/v1/important-info', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId, ...body }),
            })
          : await fetch(`/api/v1/important-info/${item!.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error?.message ?? 'Could not save this item.');
        return;
      }

      if (mode === 'create') {
        reset();
        setOpen(false);
      }
      onSaved?.(responseBody as ImportantInfoDTO);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'create' && !open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        + Add Important Info
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="important-info-title">Title</label>
        <input
          id="important-info-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-content">Content</label>
        <textarea
          id="important-info-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={5000}
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-location-name">Location name</label>
        <input
          id="important-info-location-name"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-location-address">Location address</label>
        <input
          id="important-info-location-address"
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-location-map-link">Map link</label>
        <input
          id="important-info-location-map-link"
          value={locationMapLink}
          onChange={(e) => setLocationMapLink(e.target.value)}
          placeholder="https://maps.google.com/…"
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="important-info-contact-name">Contact name</label>
          <input
            id="important-info-contact-name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="important-info-contact-phone">Contact phone</label>
          <input
            id="important-info-contact-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="important-info-contact-email">Contact email</label>
          <input
            id="important-info-contact-email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
      </div>

      <label className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private
      </label>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Add Important Info' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-dark-outline"
          onClick={() => {
            if (mode === 'create') {
              reset();
              setOpen(false);
            } else {
              onCancel?.();
            }
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
