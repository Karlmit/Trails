'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import type { IdeaDTO } from '@/components/IdeaCard';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';
import { OwnerCreateError } from '@/lib/hooks/useOwnerId';

const PRIORITIES = ['MUST_DO', 'WOULD_LIKE', 'MAYBE'] as const;

const WEATHER_SUITABILITIES = ['INDOOR', 'OUTDOOR', 'EITHER'] as const;

interface IdeaFormProps {
  tripId: string;
  sections: { id: string; name: string }[];
  categoryOptions: string[];
  mode?: 'create' | 'edit';
  idea?: IdeaDTO;
  // The Entry→Idea convert page's seed (Activity title/location/expense
  // carried over, editable) -- same role as EntryForm's own `initialValues`
  // prop for the opposite direction. `idea` (edit mode) always wins; this
  // only ever seeds create mode.
  initialValues?: Partial<IdeaDTO>;
  // Overrides where create mode POSTs -- the convert page submits to
  // /api/v1/timeline-entries/[entryId]/convert-to-idea instead of the plain
  // create endpoint, same as EntryForm's own `apiUrl` override.
  apiUrl?: string;
  // The convert page always renders this open, pre-filled -- unlike the
  // Ideas list's own collapsed-behind-a-button embedding.
  startOpen?: boolean;
  onSaved?: (idea: IdeaDTO) => void;
  onCancel?: () => void;
}

// FR-16/FR-17, spec-ideas: create + edit an Idea in one component (same
// dual-mode shape as ImportantInfoForm, since Ideas now have a genuine
// "Edit" path too -- create mode manages its own toggle-open state
// (SectionManager's pattern); edit mode is controlled by its parent
// (IdeaCard), same as ImportantInfoForm mounted from ImportantInfoCard.
//
// Links/Photos live inside this same card as the rest of the form (not as
// separate sibling sections IdeaCard bolts on afterward, which read as
// disconnected "outside the form") -- same placement ImportantInfoForm
// uses. User-reported, for both forms: they used to appear only once the
// Idea already existed, so a brand-new Idea offered neither. A Link/Photo
// does need a real ownerId, so create mode now creates the Idea lazily on
// the first attach -- see `ensureIdeaId` below. The one exception is the
// Entry->Idea convert page (`apiUrl`): its create call *consumes* the
// source Entry, which must never happen as a side effect of attaching a
// photo, so that path keeps offering neither (Links/Photos stay available
// on the resulting Idea's own edit form).
export function IdeaForm({
  tripId,
  sections,
  categoryOptions,
  mode = 'create',
  idea,
  initialValues,
  apiUrl,
  startOpen = false,
  onSaved,
  onCancel,
}: IdeaFormProps) {
  const t = useTranslations('errors');
  const ti = useTranslations('tripIdeas');
  const router = useRouter();
  const seed = idea ?? initialValues;
  const [open, setOpen] = useState(mode === 'edit' || startOpen);
  const [title, setTitle] = useState(seed?.title ?? '');
  const [sectionId, setSectionId] = useState(seed?.sectionId ?? '');
  const [category, setCategory] = useState(seed?.category ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    (seed?.priority as (typeof PRIORITIES)[number]) ?? 'WOULD_LIKE',
  );
  const [weatherSuitability, setWeatherSuitability] = useState<(typeof WEATHER_SUITABILITIES)[number]>(
    (seed?.weatherSuitability as (typeof WEATHER_SUITABILITIES)[number]) ?? 'EITHER',
  );
  const [locationName, setLocationName] = useState(seed?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(seed?.locationAddress ?? '');
  const [locationMapLink, setLocationMapLink] = useState(seed?.locationMapLink ?? '');
  const [estimatedExpenseAmount, setEstimatedExpenseAmount] = useState(
    seed?.estimatedExpenseAmount != null ? String(seed.estimatedExpenseAmount) : '',
  );
  const [estimatedExpenseCurrency, setEstimatedExpenseCurrency] = useState(seed?.estimatedExpenseCurrency ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Create-on-first-attach, so Links/Photos work before this Idea exists --
  // same shape as ImportantInfoForm's own `ensureItemId` (see that file, and
  // lib/hooks/useOwnerId.ts). Refs, not state: `ensureIdeaId` reads/writes
  // the id synchronously, and a second concurrent call (a Link added while
  // a photo is still uploading) must see the *in-flight* create rather than
  // firing a second one. In edit mode this is just the Idea's own id from
  // the start, so nothing is ever created here.
  const existingIdRef = useRef<string | null>(idea?.id ?? null);
  const creatingRef = useRef<Promise<string> | null>(null);
  // Only drives the "already saved" hint + Cancel's discard path.
  const [draftCreated, setDraftCreated] = useState(false);
  // A convert (`apiUrl`) deliberately opts out -- see the comment above.
  const canCreateOnAttach = mode === 'create' && !apiUrl;

  function reset() {
    setTitle('');
    setSectionId('');
    setCategory('');
    setDescription('');
    setPriority('WOULD_LIKE');
    setWeatherSuitability('EITHER');
    setLocationName('');
    setLocationAddress('');
    setLocationMapLink('');
    setEstimatedExpenseAmount('');
    setEstimatedExpenseCurrency('');
    existingIdRef.current = null;
    setDraftCreated(false);
  }

  function fieldsBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      title,
      sectionId: sectionId || null,
      category: category || null,
      description: description || null,
      priority,
      weatherSuitability,
      locationName: locationName || null,
      locationAddress: locationAddress || null,
      locationMapLink: locationMapLink || null,
    };

    const amountEntered = estimatedExpenseAmount.trim() !== '';
    const currencyEntered = estimatedExpenseCurrency.trim() !== '';
    if (amountEntered || currencyEntered) {
      body.estimatedExpenseAmount = amountEntered ? Number(estimatedExpenseAmount) : null;
      body.estimatedExpenseCurrency = currencyEntered ? estimatedExpenseCurrency : null;
    }

    return body;
  }

  async function ensureIdeaId(): Promise<string> {
    if (existingIdRef.current) return existingIdRef.current;
    if (creatingRef.current) return creatingRef.current;

    const promise = (async () => {
      let response: Response;
      try {
        response = await fetch('/api/v1/ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId,
            ...fieldsBody(),
            // A blank title can't be saved at all (the schema requires
            // one) -- but blocking the very first photo on "type a title
            // first" would just trade one annoyance for another. Same
            // "Untitled" convention as ImportantInfoForm/BlogPostForm: a
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
        throw new OwnerCreateError(translateApiError(t, body?.error?.message) ?? ti('couldNotSaveIdea'));
      }
      existingIdRef.current = (body as IdeaDTO).id;
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

  // Cancelling a create that already had something attached to it can't just
  // forget the form -- the Idea exists on the server by then. Offer to throw
  // it away (its Links/Photos go with it, same cascade the Idea's own Delete
  // uses); declining keeps the form open so the User can finish and Save
  // instead.
  async function discardDraft(): Promise<boolean> {
    const draftId = existingIdRef.current;
    if (!draftId) return true;
    if (!confirm(ti('discardDraftConfirm'))) return false;

    setDiscarding(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ideas/${draftId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? ti('couldNotDeleteIdea'));
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const body = fieldsBody();
    // Edit mode's own id, or -- in create mode -- the Idea an attach already
    // created above. Either way Save is a PATCH of that same row, never a
    // second, duplicate Idea.
    const existingId = existingIdRef.current;

    try {
      const response = existingId
        ? await fetch(`/api/v1/ideas/${existingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(apiUrl ?? '/api/v1/ideas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tripId, ...body }),
          });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, responseBody?.error?.message) ?? ti('couldNotSaveIdea'));
        return;
      }

      if (mode === 'create') {
        reset();
        setOpen(false);
      }
      onSaved?.(responseBody as IdeaDTO);
      router.refresh();
    } catch {
      setError(ti('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'create' && !open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        {ti('openButton')}
      </button>
    );
  }

  return (
    // The outer div, not the <form>, carries the `.card` box styling --
    // LinkList/PhotoGallery below each render their own <form> for their
    // "Add" control, and a <form> nested inside another <form> is invalid
    // HTML (silent hydration mismatch in production, a loud React warning
    // in dev). This way the whole thing -- fields, then Links/Photos --
    // still reads as one visual card.
    <div className="card stack">
      <form onSubmit={handleSubmit} className="stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="idea-title">{ti('titleLabel')}</label>
        <input
          id="idea-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="idea-section">{ti('sectionLabel')}</label>
        <select id="idea-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">{ti('noSectionOption')}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="idea-category">{ti('categoryLabel')}</label>
        <input id="idea-category" value={category} onChange={(e) => setCategory(e.target.value)} />
        {/* User-reported: the native <datalist> dropdown this used to be
            wasn't recognizable as "pick from existing categories" -- easy
            to miss its suggestion popup entirely, and easy to confuse with
            unrelated browser/OS text-suggestion bubbles. Plain clickable
            chips are unambiguous and need no explanation. */}
        {categoryOptions.length > 0 && (
          <div className="row" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
            {categoryOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="tag-chip"
                onClick={() => setCategory(option)}
                style={{ border: 'none', cursor: 'pointer' }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="idea-description">{ti('descriptionLabel')}</label>
        <textarea
          id="idea-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-priority">{ti('priorityLabel')}</label>
          <select
            id="idea-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {ti(`priority.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-weather-suitability">{ti('weatherSuitabilityLabel')}</label>
          <select
            id="idea-weather-suitability"
            value={weatherSuitability}
            onChange={(e) => setWeatherSuitability(e.target.value as typeof weatherSuitability)}
          >
            {WEATHER_SUITABILITIES.map((option) => (
              <option key={option} value={option}>
                {ti(`weatherSuitability.${option}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="idea-location-name">{ti('locationNameLabel')}</label>
        <input id="idea-location-name" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="idea-location-address">{ti('locationAddressLabel')}</label>
        <input
          id="idea-location-address"
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="idea-location-map-link">{ti('mapLinkLabel')}</label>
        <input
          id="idea-location-map-link"
          value={locationMapLink}
          onChange={(e) => setLocationMapLink(e.target.value)}
          placeholder="https://maps.google.com/…"
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-expense-amount">{ti('estimatedExpenseLabel')}</label>
          <input
            id="idea-expense-amount"
            type="number"
            min="0"
            step="0.01"
            value={estimatedExpenseAmount}
            onChange={(e) => setEstimatedExpenseAmount(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-expense-currency">{ti('currencyLabel')}</label>
          <input
            id="idea-expense-currency"
            value={estimatedExpenseCurrency}
            onChange={(e) => setEstimatedExpenseCurrency(e.target.value.toUpperCase())}
            placeholder="USD"
            maxLength={3}
          />
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
          {submitting ? ti('saving') : mode === 'create' ? ti('addIdea') : ti('save')}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={handleCancel} disabled={discarding}>
          {discarding ? ti('deleting') : ti('cancel')}
        </button>
      </div>
      </form>

      {(canCreateOnAttach || (mode === 'edit' && idea)) && (
        <>
          <LinkList
            ownerType="IDEA"
            ownerId={idea?.id ?? ''}
            ensureOwnerId={canCreateOnAttach ? ensureIdeaId : undefined}
          />
          <PhotoGallery
            tripId={idea?.tripId ?? tripId}
            ownerType="IDEA"
            ownerId={idea?.id ?? ''}
            ensureOwnerId={canCreateOnAttach ? ensureIdeaId : undefined}
          />
          {draftCreated && (
            <p className="text-soft" style={{ margin: 0, fontSize: '0.85rem' }}>
              {ti('draftCreatedHint')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
