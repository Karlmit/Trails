'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { IdeaDTO } from '@/components/IdeaCard';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';

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
// User-requested: Links/Photos are only addable once the Idea exists, and
// live inside this same card as the rest of the form (not as separate
// sibling sections IdeaCard bolts on afterward, which read as disconnected
// "outside the form") -- same constraint/placement ImportantInfoForm uses,
// since a Link/Photo needs a real ownerId to attach to.
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
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

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

    try {
      const response =
        mode === 'create'
          ? await fetch(apiUrl ?? '/api/v1/ideas', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId, ...body }),
            })
          : await fetch(`/api/v1/ideas/${idea!.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
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
          {ti('cancel')}
        </button>
      </div>
      </form>

      {mode === 'edit' && idea && (
        <>
          <LinkList ownerType="IDEA" ownerId={idea.id} />
          <PhotoGallery tripId={idea.tripId} ownerType="IDEA" ownerId={idea.id} />
        </>
      )}
    </div>
  );
}
