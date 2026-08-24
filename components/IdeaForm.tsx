'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { IdeaDTO } from '@/components/IdeaCard';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery } from '@/components/PhotoGallery';

const PRIORITIES = [
  { value: 'MUST_DO', label: 'Must do' },
  { value: 'WOULD_LIKE', label: 'Would like' },
  { value: 'MAYBE', label: 'Maybe' },
] as const;

const WEATHER_SUITABILITIES = [
  { value: 'INDOOR', label: 'Indoor' },
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'EITHER', label: 'Either' },
] as const;

interface IdeaFormProps {
  tripId: string;
  sections: { id: string; name: string }[];
  categoryOptions: string[];
  mode?: 'create' | 'edit';
  idea?: IdeaDTO;
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
  onSaved,
  onCancel,
}: IdeaFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(mode === 'edit');
  const [title, setTitle] = useState(idea?.title ?? '');
  const [sectionId, setSectionId] = useState(idea?.sectionId ?? '');
  const [category, setCategory] = useState(idea?.category ?? '');
  const [description, setDescription] = useState(idea?.description ?? '');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]['value']>(
    (idea?.priority as (typeof PRIORITIES)[number]['value']) ?? 'WOULD_LIKE',
  );
  const [weatherSuitability, setWeatherSuitability] = useState<(typeof WEATHER_SUITABILITIES)[number]['value']>(
    (idea?.weatherSuitability as (typeof WEATHER_SUITABILITIES)[number]['value']) ?? 'EITHER',
  );
  const [locationName, setLocationName] = useState(idea?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(idea?.locationAddress ?? '');
  const [locationMapLink, setLocationMapLink] = useState(idea?.locationMapLink ?? '');
  const [estimatedExpenseAmount, setEstimatedExpenseAmount] = useState(
    idea?.estimatedExpenseAmount != null ? String(idea.estimatedExpenseAmount) : '',
  );
  const [estimatedExpenseCurrency, setEstimatedExpenseCurrency] = useState(idea?.estimatedExpenseCurrency ?? '');
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
          ? await fetch('/api/v1/ideas', {
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
        setError(responseBody?.error?.message ?? 'Could not save this Idea.');
        return;
      }

      if (mode === 'create') {
        reset();
        setOpen(false);
      }
      onSaved?.(responseBody as IdeaDTO);
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
        + Add Idea
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
        <label htmlFor="idea-title">Title</label>
        <input
          id="idea-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="idea-section">Section</label>
        <select id="idea-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">No Section</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="idea-category">Category</label>
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
        <label htmlFor="idea-description">Description</label>
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
          <label htmlFor="idea-priority">Priority</label>
          <select
            id="idea-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-weather-suitability">Weather suitability</label>
          <select
            id="idea-weather-suitability"
            value={weatherSuitability}
            onChange={(e) => setWeatherSuitability(e.target.value as typeof weatherSuitability)}
          >
            {WEATHER_SUITABILITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="idea-location-name">Location name</label>
        <input id="idea-location-name" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="idea-location-address">Location address</label>
        <input
          id="idea-location-address"
          value={locationAddress}
          onChange={(e) => setLocationAddress(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="idea-location-map-link">Map link</label>
        <input
          id="idea-location-map-link"
          value={locationMapLink}
          onChange={(e) => setLocationMapLink(e.target.value)}
          placeholder="https://maps.google.com/…"
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="idea-expense-amount">Estimated expense</label>
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
          <label htmlFor="idea-expense-currency">Currency</label>
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
          {submitting ? 'Saving…' : mode === 'create' ? 'Add Idea' : 'Save'}
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

      {mode === 'edit' && idea && (
        <>
          <LinkList ownerType="IDEA" ownerId={idea.id} />
          <PhotoGallery tripId={idea.tripId} ownerType="IDEA" ownerId={idea.id} />
        </>
      )}
    </div>
  );
}
