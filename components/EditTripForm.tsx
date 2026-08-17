'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { TimezoneSelect } from '@/components/TimezoneSelect';

interface EditTripFormProps {
  trip: {
    id: string;
    name: string;
    destination: string | null;
    startDate: string;
    endDate: string;
    timezone: string;
    description: string | null;
    visibility: 'PUBLIC' | 'PRIVATE';
  };
  onDone: () => void;
}

export function EditTripForm({ trip, onDone }: EditTripFormProps) {
  const router = useRouter();
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination ?? '');
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [timezone, setTimezone] = useState(trip.timezone);
  const [description, setDescription] = useState(trip.description ?? '');
  const [visibility, setVisibility] = useState(trip.visibility);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // I/O matrix ("Timezone selection"): '' means the user typed something
    // but never picked a zone from the list -- block submission rather
    // than saving an unvalidated string.
    if (!timezone) {
      setError('Please pick a timezone from the list.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          destination: destination || null,
          startDate,
          endDate,
          timezone,
          description: description || null,
          visibility,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not save changes.');
        return;
      }

      router.refresh();
      onDone();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="edit-name">Name</label>
        <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="edit-destination">Destination</label>
        <input
          id="edit-destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="edit-start">Start date</label>
          <input
            id="edit-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="edit-end">End date</label>
          <input
            id="edit-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="edit-timezone">Timezone</label>
        <TimezoneSelect id="edit-timezone" initialValue={timezone} onChange={setTimezone} required />
      </div>
      <div className="field">
        <label htmlFor="edit-description">Description</label>
        <textarea
          id="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-visibility">Visibility</label>
        <select
          id="edit-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
        >
          <option value="PRIVATE">Private</option>
          <option value="PUBLIC">Public</option>
        </select>
      </div>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
