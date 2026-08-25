'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { useAutoEndDate } from '@/lib/hooks/useAutoEndDate';

export function NewTripForm() {
  const t = useTranslations('errors');
  const tTrips = useTranslations('trips');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // spec-entry-fields-datepickers: a brand-new Trip form never starts with
  // an End already stored, so auto-fill starts armed.
  const autoEndDate = useAutoEndDate(false);
  const [coverImage, setCoverImage] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // I/O matrix ("Timezone selection"): TimezoneSelect only ever reports a
    // real, list-backed IANA string or '' -- '' means the user typed
    // something but never picked a zone, which must block submission.
    if (!timezone) {
      setError(tTrips('pickTimezone'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          destination: destination || undefined,
          startDate,
          endDate,
          timezone,
          description: description || undefined,
          coverImage: coverImage || undefined,
          visibility,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, body?.error?.message) ?? tTrips('createFailed'));
        return;
      }

      // FR-1/FR-7: a newly created Trip redirects straight to its Timeline.
      router.push(`/trips/${body.id}/timeline`);
      router.refresh();
      // review-caught: this form's `open` toggle keeps the same component
      // instance mounted across Cancel/reopen cycles (unlike EditTripForm,
      // which is conditionally mounted by its parent) -- without this,
      // `autoEndDate`'s touched-state from this submission would silently
      // persist into the next "+ New Trip" session and disarm auto-fill for
      // the rest of the page's lifetime. Same reset SectionManager's create
      // form already does after both submit and Cancel.
      autoEndDate.reset(false);
    } catch {
      setError(tTrips('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {tTrips('newTrip')}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="trip-name">{tTrips('nameLabel')}</label>
        <input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="trip-destination">{tTrips('destinationLabel')}</label>
        <input
          id="trip-destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="trip-start">{tTrips('startDateLabel')}</label>
          <input
            id="trip-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              const value = e.target.value;
              setStartDate(value);
              // spec-entry-fields-datepickers: End auto-follows Start until
              // the User explicitly picks their own End.
              if (!autoEndDate.touched()) setEndDate(value);
            }}
            required
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="trip-end">{tTrips('endDateLabel')}</label>
          <input
            id="trip-end"
            type="date"
            value={endDate}
            onChange={(e) => {
              const value = e.target.value;
              // review-caught: only a genuinely complete End value counts
              // as a deliberate choice -- the browser's native clear button
              // producing '' must not permanently disarm auto-fill.
              if (value) autoEndDate.markTouched();
              setEndDate(value);
            }}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="trip-timezone">{tTrips('timezoneLabel')}</label>
        <TimezoneSelect id="trip-timezone" initialValue={timezone} onChange={setTimezone} required />
      </div>
      <div className="field">
        <label htmlFor="trip-description">{tTrips('descriptionLabel')}</label>
        <textarea
          id="trip-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="field">
        <label htmlFor="trip-cover-image">{tTrips('coverImageLabel')}</label>
        <input
          id="trip-cover-image"
          type="url"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="field">
        <label htmlFor="trip-visibility">{tTrips('visibilityLabel')}</label>
        <select
          id="trip-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
        >
          <option value="PRIVATE">{tTrips('visibilityPrivate')}</option>
          <option value="PUBLIC">{tTrips('visibilityPublic')}</option>
        </select>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? tTrips('creating') : tTrips('createTrip')}
        </button>
        <button
          type="button"
          className="btn btn-dark-outline"
          onClick={() => {
            setOpen(false);
            autoEndDate.reset(false);
          }}
        >
          {tTrips('cancel')}
        </button>
      </div>
    </form>
  );
}
