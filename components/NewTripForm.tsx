'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TimezoneSelect } from '@/components/TimezoneSelect';

export function NewTripForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
      setError('Please pick a timezone from the list.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, destination: destination || undefined, startDate, endDate, timezone }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create the Trip.');
        return;
      }

      // FR-1/FR-7: a newly created Trip redirects straight to its Timeline.
      router.push(`/trips/${body.id}/timeline`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + New Trip
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="trip-name">Name</label>
        <input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="trip-destination">Destination</label>
        <input
          id="trip-destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="trip-start">Start date</label>
          <input
            id="trip-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="trip-end">End date</label>
          <input
            id="trip-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="trip-timezone">Timezone</label>
        <TimezoneSelect id="trip-timezone" initialValue={timezone} onChange={setTimezone} required />
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Trip'}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
