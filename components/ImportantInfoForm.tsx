'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import type { ImportantInfoDTO } from '@/components/ImportantInfoCard';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';
import { AttachmentList } from '@/components/AttachmentList';
import { OwnerCreateError } from '@/lib/hooks/useOwnerId';

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
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  const ti = useTranslations('tripImportantInfo');
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
  const [discarding, setDiscarding] = useState(false);

  // User-reported: Tags/Links/Photos/Documents used to appear only after the
  // item had been saved and re-opened for Edit ("all those should be visible
  // when creating a new"). Each of those rows needs a real ownerId to attach
  // to, so create mode now creates the item lazily, on the first attach --
  // same `ensurePostId` shape as BlogPostForm's, which solved the identical
  // "add an image before the post exists" problem. A ref, not state:
  // `ensureItemId` has to read/write it synchronously, and a second
  // concurrent call (a Link added while a photo is still uploading, or two
  // photos picked back to back) must see the *in-flight* create rather than
  // firing a second one -- see `creatingRef`. In edit mode this is just the
  // item's own id from the start, so nothing is ever created here.
  const existingIdRef = useRef<string | null>(item?.id ?? null);
  const creatingRef = useRef<Promise<string> | null>(null);
  // Only drives the "already saved" hint + Cancel's discard path; the id
  // itself always comes from the ref above.
  const [draftCreated, setDraftCreated] = useState(false);

  function fieldsBody(): Record<string, unknown> {
    return {
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
  }

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
    existingIdRef.current = null;
    setDraftCreated(false);
  }

  async function ensureItemId(): Promise<string> {
    if (existingIdRef.current) return existingIdRef.current;
    if (creatingRef.current) return creatingRef.current;

    const promise = (async () => {
      let response: Response;
      try {
        response = await fetch('/api/v1/important-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId,
            ...fieldsBody(),
            // A blank title can't be saved at all (the schema requires one)
            // -- but blocking the very first photo on "type a title first"
            // would just trade one annoyance for another. Same "Untitled"
            // convention as BlogPostForm's own create-on-first-upload: a
            // placeholder the User renames before Save, which is still
            // required to enable the Save button at all.
            title: title.trim() || ti('untitledFallback'),
          }),
        });
      } catch {
        throw new OwnerCreateError(ti('networkError'));
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new OwnerCreateError(translateApiError(t, body?.error?.message) ?? ti('saveError'));
      }
      existingIdRef.current = (body as ImportantInfoDTO).id;
      setDraftCreated(true);
      return existingIdRef.current;
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
    setSubmitting(true);

    const body = fieldsBody();
    // In create mode this is null unless an attach already created the item
    // above -- if it did, Save is a PATCH of that same row, not a second,
    // duplicate item.
    const existingId = existingIdRef.current;

    try {
      const response = existingId
        ? await fetch(`/api/v1/important-info/${existingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/v1/important-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tripId, ...body }),
          });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, responseBody?.error?.message) ?? ti('saveError'));
        return;
      }

      if (mode === 'create') {
        reset();
        setOpen(false);
      }
      onSaved?.(responseBody as ImportantInfoDTO);
      router.refresh();
    } catch {
      setError(ti('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  // Cancelling a create that already had something attached to it can't just
  // forget the form -- the item exists on the server by then. Offer to throw
  // it away (its Tags/Links/Photos/Documents go with it, same polymorphic
  // cascade the item's own Delete uses); declining keeps the form open so
  // the User can finish and Save instead.
  async function discardDraft(): Promise<boolean> {
    const draftId = existingIdRef.current;
    if (!draftId) return true;
    if (!confirm(ti('discardDraftConfirm'))) return false;

    setDiscarding(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/important-info/${draftId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? ti('deleteError'));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(ti('networkError'));
      return false;
    } finally {
      setDiscarding(false);
    }
  }

  async function handleCancel() {
    if (mode !== 'create') {
      onCancel?.();
      return;
    }
    if (!(await discardDraft())) return;
    reset();
    setOpen(false);
  }

  if (mode === 'create' && !open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        {ti('addButtonCta')}
      </button>
    );
  }

  return (
    // The outer div, not the <form>, carries the `.card` box styling --
    // Tags/Links/Documents/Photos below each mount their own <form> for
    // their "Add" control, and a <form> nested inside another <form> is
    // invalid HTML (silent hydration mismatch in production, a loud React
    // warning in dev). This way the whole thing -- fields, then Tags/
    // Links/Documents/Photos -- still reads as one visual card, not a form
    // with disconnected sections bolted on after it (user-reported).
    <div className="card stack">
      <form onSubmit={handleSubmit} className="stack">
        {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="important-info-title">{ti('titleLabel')}</label>
        <input
          id="important-info-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-content">{ti('descriptionLabel')}</label>
        <textarea
          id="important-info-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={5000}
        />
      </div>

      <div className="field">
        <label htmlFor="important-info-emoji">{ti('emojiOptionalLabel')}</label>
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
        {ti('private')}
      </label>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? tc('saving') : mode === 'create' ? ti('addButton') : tc('save')}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={handleCancel} disabled={discarding}>
          {discarding ? ti('deleting') : tc('cancel')}
        </button>
      </div>
      </form>

      {/* Tags/Links/Photos/Documents, in both modes. Create mode has no id
          to attach them to yet, so it hands each list an `ensureItemId`
          instead: whichever one the User reaches for first creates the item
          (see that function's comment), and the rest attach to that same
          row. */}
      <TagList
        ownerType="IMPORTANT_INFO"
        ownerId={item?.id ?? ''}
        ensureOwnerId={mode === 'create' ? ensureItemId : undefined}
      />
      <LinkList
        ownerType="IMPORTANT_INFO"
        ownerId={item?.id ?? ''}
        ensureOwnerId={mode === 'create' ? ensureItemId : undefined}
      />
      <PhotoGallery
        tripId={item?.tripId ?? tripId}
        ownerType="IMPORTANT_INFO"
        ownerId={item?.id ?? ''}
        ensureOwnerId={mode === 'create' ? ensureItemId : undefined}
      />
      <AttachmentList
        tripId={item?.tripId ?? tripId}
        ownerType="IMPORTANT_INFO"
        ownerId={item?.id ?? ''}
        ensureOwnerId={mode === 'create' ? ensureItemId : undefined}
      />

      {mode === 'create' && draftCreated && (
        <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
          {ti('draftCreatedHint')}
        </p>
      )}
    </div>
  );
}
