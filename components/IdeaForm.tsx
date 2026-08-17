'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

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

// FR-16, spec-ideas: create an Idea. Same toggle-open inline-form pattern as
// SectionManager (open a `.card` form, POST, close + router.refresh on
// success) -- no new UI pattern introduced for the create step itself.
export function IdeaForm({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]['value']>('WOULD_LIKE');
  const [weatherSuitability, setWeatherSuitability] =
    useState<(typeof WEATHER_SUITABILITIES)[number]['value']>('EITHER');
  const [weatherTags, setWeatherTags] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationMapLink, setLocationMapLink] = useState('');
  const [estimatedExpenseAmount, setEstimatedExpenseAmount] = useState('');
  const [estimatedExpenseCurrency, setEstimatedExpenseCurrency] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle('');
    setCategory('');
    setPriority('WOULD_LIKE');
    setWeatherSuitability('EITHER');
    setWeatherTags('');
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
      tripId,
      title,
      category: category || null,
      priority,
      weatherSuitability,
      weatherTags: weatherTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
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
      const response = await fetch('/api/v1/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error?.message ?? 'Could not create this Idea.');
        return;
      }

      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
        + Add Idea
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
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
        <label htmlFor="idea-category">Category</label>
        <input id="idea-category" value={category} onChange={(e) => setCategory(e.target.value)} />
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
        <label htmlFor="idea-weather-tags">Weather tags</label>
        <input
          id="idea-weather-tags"
          value={weatherTags}
          onChange={(e) => setWeatherTags(e.target.value)}
          placeholder="Rainy day, Sunny weather"
        />
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
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Idea'}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
