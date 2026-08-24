'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ImportantInfoDTO } from '@/components/ImportantInfoCard';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';
import { AttachmentList } from '@/components/AttachmentList';

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
  const [emoji, setEmoji] = useState(item?.emoji ?? '');
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
    setEmoji('');
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
      emoji: emoji.trim() || null,
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
    // Tags/Links/Documents/Photos below are siblings of this <form>, not
    // children of it -- each mounts its own <form> for its "Add" control,
    // and a <form> nested inside another <form> is invalid HTML (silent
    // hydration mismatch in production, a loud React warning in dev).
    <div className="stack">
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
        <label htmlFor="important-info-content">Description</label>
        <textarea
          id="important-info-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={5000}
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-emoji">Emoji (optional)</label>
        <input
          id="important-info-emoji"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          maxLength={16}
          placeholder="📌"
          style={{ maxWidth: '80px' }}
        />
      </div>

      {/* Location/contact fields deliberately have no inputs here any more
          -- user-reported: "too many fields when adding one. It should
          only be title and description." Their state above still starts
          from `item`'s existing values and is still sent unchanged in the
          submit body below, so editing an item that already has some of
          this data (from before this simplification) never wipes it. */}

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

      {/* User-requested: Tags/Links/Documents/Photos are only addable once
          this item exists (Tag/Link/Attachment/Photo all need a real
          ownerId to attach to) -- create mode never offers these. Siblings
          of the <form> above, not nested inside it (see the comment at
          this component's return). */}
      {mode === 'edit' && item && (
        <>
          <TagList ownerType="IMPORTANT_INFO" ownerId={item.id} />
          <LinkList ownerType="IMPORTANT_INFO" ownerId={item.id} />
          <PhotoGallery tripId={item.tripId} ownerType="IMPORTANT_INFO" ownerId={item.id} />
          <AttachmentList tripId={item.tripId} ownerType="IMPORTANT_INFO" ownerId={item.id} />
        </>
      )}
    </div>
  );
}
