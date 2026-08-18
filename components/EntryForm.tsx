'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ENTRY_TYPE_LABELS, SUBTYPES_BY_ENTRY_TYPE, subtypeLabel } from '@/lib/entry-types/labels';

export type CreatableEntryType = 'STAY' | 'TRANSPORT' | 'ACTIVITY' | 'NOTE';

export interface EntryDTO {
  id: string;
  tripId: string;
  entryType: CreatableEntryType;
  subtype: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  bookingReference: string | null;
  expenseAmount: number | null;
  expenseCurrency: string | null;
  expensePaymentStatus: string | null;
  expensePaymentNote: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  postTripNotes: string | null;
  typeDetails: Record<string, unknown>;
  isPrivate: boolean;
}

interface EntryFormProps {
  tripId: string;
  mode: 'create' | 'edit';
  entry?: EntryDTO;
  // spec-ideas (FR-17): pre-fills a *create*-mode form (e.g. from an Idea's
  // title/estimated expense) without supplying a full EntryDTO -- ignored
  // when `entry` is also given (edit mode always wins).
  initialValues?: Partial<EntryDTO>;
  // spec-ideas (FR-17): submits to a different endpoint than the default
  // create/edit routes (the Idea convert endpoint) while keeping every
  // other create-mode behavior -- including the on-success redirect to the
  // new Entry -- identical.
  apiUrl?: string;
  onSaved?: (entry: EntryDTO) => void;
  onCancel?: () => void;
}

const ENTRY_TYPES: CreatableEntryType[] = ['STAY', 'TRANSPORT', 'ACTIVITY', 'NOTE'];

// datetime-local inputs want `YYYY-MM-DDTHH:mm` in the *browser's* local
// time -- converted back to a real ISO instant on submit. (Known v1
// simplification: there is no per-Trip-timezone entry widget yet, so this
// reads/writes in whatever timezone the browser itself is set to.)
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function EntryForm({ tripId, mode, entry, initialValues, apiUrl, onSaved, onCancel }: EntryFormProps) {
  const router = useRouter();
  // `entry` (edit mode) always wins; `initialValues` only ever seeds a
  // create-mode form (spec-ideas' convert step).
  const seed = entry ?? initialValues;
  const [entryType, setEntryType] = useState<CreatableEntryType>(seed?.entryType ?? 'ACTIVITY');
  const [subtype, setSubtype] = useState(seed?.subtype ?? '');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [startAt, setStartAt] = useState(toDateTimeLocal(seed?.startAt ?? null));
  const [endAt, setEndAt] = useState(toDateTimeLocal(seed?.endAt ?? null));
  const [locationName, setLocationName] = useState(seed?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(seed?.locationAddress ?? '');
  const [locationMapLink, setLocationMapLink] = useState(seed?.locationMapLink ?? '');
  const [bookingReference, setBookingReference] = useState(seed?.bookingReference ?? '');
  const [expenseAmount, setExpenseAmount] = useState(
    seed?.expenseAmount != null ? String(seed.expenseAmount) : '',
  );
  const [expenseCurrency, setExpenseCurrency] = useState(seed?.expenseCurrency ?? '');
  const [expensePaymentStatus, setExpensePaymentStatus] = useState(seed?.expensePaymentStatus ?? '');
  const [expensePaymentNote, setExpensePaymentNote] = useState(seed?.expensePaymentNote ?? '');
  const [contactName, setContactName] = useState(seed?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(seed?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(seed?.contactEmail ?? '');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [postTripNotes, setPostTripNotes] = useState(seed?.postTripNotes ?? '');
  // spec-guest-access (FR-28): `isPrivate` defaults to `false` for a new
  // Entry, same as the DB column's own default.
  const [isPrivate, setIsPrivate] = useState(seed?.isPrivate ?? false);

  const typeDetails = seed?.typeDetails ?? {};
  const [roomInfo, setRoomInfo] = useState(str(typeDetails.roomInfo));
  const [terminal, setTerminal] = useState(str(typeDetails.terminal));
  const [gate, setGate] = useState(str(typeDetails.gate));
  const [platform, setPlatform] = useState(str(typeDetails.platform));
  const [serviceNumber, setServiceNumber] = useState(str(typeDetails.serviceNumber));
  const [seat, setSeat] = useState(str(typeDetails.seat));
  const [baggageInfo, setBaggageInfo] = useState(str(typeDetails.baggageInfo));

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // FR-14: a Note carries no Location, Expense, or booking-reference
  // fields at all -- hidden here, and never sent to the API for this type.
  const showLocation = entryType !== 'NOTE';
  const showBookingExpense = entryType !== 'NOTE';
  const showEnd = entryType !== 'NOTE';
  const endRequired = entryType === 'STAY' || entryType === 'TRANSPORT';
  const subtypeOptions = SUBTYPES_BY_ENTRY_TYPE[entryType] ?? [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!startAt) {
      setError('A start date/time is required.');
      return;
    }
    if (entryType !== 'NOTE' && !subtype) {
      setError('Please choose an Entry Subtype.');
      return;
    }
    if (endRequired && !endAt) {
      setError(entryType === 'STAY' ? 'Check-out is required.' : 'Arrival is required.');
      return;
    }

    const body: Record<string, unknown> = {
      title,
      description: description || null,
      startAt: new Date(startAt).toISOString(),
      notes: notes || null,
      postTripNotes: postTripNotes || null,
    };

    if (showEnd) {
      // Send `endAt` whenever this type shows the field at all -- both a
      // new value (converted to an ISO instant) and an explicit clear
      // (`null`) so blanking the field on edit actually clears it
      // server-side instead of leaving the stale stored value in place.
      body.endAt = endAt ? new Date(endAt).toISOString() : null;
    }

    // FR-15: Contact Information is shared by every TimelineEntry type,
    // Note included -- sent unconditionally so anything typed into these
    // fields for a Note is never silently dropped.
    body.contactName = contactName || null;
    body.contactPhone = contactPhone || null;
    body.contactEmail = contactEmail || null;
    body.isPrivate = isPrivate;

    if (entryType !== 'NOTE') {
      body.subtype = subtype;
      body.locationName = locationName || null;
      body.locationAddress = locationAddress || null;
      body.locationMapLink = locationMapLink || null;
      body.bookingReference = bookingReference || null;

      const amountEntered = expenseAmount.trim() !== '';
      const currencyEntered = expenseCurrency.trim() !== '';
      if (amountEntered || currencyEntered) {
        body.expenseAmount = amountEntered ? Number(expenseAmount) : null;
        body.expenseCurrency = currencyEntered ? expenseCurrency : null;
        body.expensePaymentStatus = expensePaymentStatus || null;
        body.expensePaymentNote = expensePaymentNote || null;
      } else if (mode === 'edit' && (entry?.expenseAmount != null || entry?.expenseCurrency != null)) {
        // Both fields were cleared -- explicitly remove the stored Expense
        // rather than silently leaving the old amount/currency in place.
        body.expenseAmount = null;
        body.expenseCurrency = null;
        body.expensePaymentStatus = null;
        body.expensePaymentNote = null;
      }
    }

    if (entryType === 'STAY') {
      body.typeDetails = { roomInfo: roomInfo || null };
    } else if (entryType === 'TRANSPORT') {
      body.typeDetails = {
        terminal: terminal || null,
        gate: gate || null,
        platform: platform || null,
        serviceNumber: serviceNumber || null,
        seat: seat || null,
        baggageInfo: baggageInfo || null,
      };
    }

    if (mode === 'create') {
      body.tripId = tripId;
      body.entryType = entryType;
    }

    setSubmitting(true);
    try {
      const url =
        apiUrl ?? (mode === 'create' ? '/api/v1/timeline-entries' : `/api/v1/timeline-entries/${entry!.id}`);
      const method = mode === 'create' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseBody?.error?.message ?? 'Could not save this Entry.');
        return;
      }

      if (mode === 'create') {
        router.push(`/trips/${tripId}/entries/${responseBody.id}`);
      } else {
        onSaved?.(responseBody);
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      {mode === 'create' && (
        <div className="field">
          <label htmlFor="entry-type">Entry Type</label>
          <select
            id="entry-type"
            value={entryType}
            onChange={(e) => {
              setEntryType(e.target.value as CreatableEntryType);
              setSubtype('');
            }}
          >
            {ENTRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTRY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="entry-title">Title</label>
        <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      {entryType !== 'NOTE' && (
        <div className="field">
          <label htmlFor="entry-subtype">{entryType === 'TRANSPORT' ? 'Mode' : 'Subtype'}</label>
          <select id="entry-subtype" value={subtype} onChange={(e) => setSubtype(e.target.value)} required>
            <option value="">Select…</option>
            {subtypeOptions.map((value) => (
              <option key={value} value={value}>
                {subtypeLabel(value)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="entry-description">Description</label>
        <textarea
          id="entry-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="entry-start">
            {entryType === 'TRANSPORT' ? 'Departure' : entryType === 'STAY' ? 'Check-in' : 'Start'}
          </label>
          <input
            id="entry-start"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </div>
        {showEnd && (
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="entry-end">
              {entryType === 'TRANSPORT' ? 'Arrival' : entryType === 'STAY' ? 'Check-out' : 'End (optional)'}
            </label>
            <input
              id="entry-end"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required={endRequired}
            />
          </div>
        )}
      </div>

      {showLocation && (
        <>
          <div className="field">
            <label htmlFor="entry-location-name">Location name</label>
            <input id="entry-location-name" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="entry-location-address">Location address</label>
            <input
              id="entry-location-address"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="entry-location-map">Map link</label>
            <input
              id="entry-location-map"
              value={locationMapLink}
              onChange={(e) => setLocationMapLink(e.target.value)}
              placeholder="https://maps.google.com/…"
            />
          </div>
        </>
      )}

      {entryType === 'STAY' && (
        <div className="field">
          <label htmlFor="entry-room-info">Room info</label>
          <input id="entry-room-info" value={roomInfo} onChange={(e) => setRoomInfo(e.target.value)} />
        </div>
      )}

      {entryType === 'TRANSPORT' && (
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-terminal">Terminal</label>
              <input id="entry-terminal" value={terminal} onChange={(e) => setTerminal(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-gate">Gate</label>
              <input id="entry-gate" value={gate} onChange={(e) => setGate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-platform">Platform</label>
              <input id="entry-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-service-number">Service number</label>
              <input
                id="entry-service-number"
                value={serviceNumber}
                onChange={(e) => setServiceNumber(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-seat">Seat</label>
              <input id="entry-seat" value={seat} onChange={(e) => setSeat(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-baggage">Baggage info</label>
              <input id="entry-baggage" value={baggageInfo} onChange={(e) => setBaggageInfo(e.target.value)} />
            </div>
          </div>
        </>
      )}

      {showBookingExpense && (
        <>
          <div className="field">
            <label htmlFor="entry-booking-ref">Booking reference</label>
            <input
              id="entry-booking-ref"
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-expense-amount">Expense amount</label>
              <input
                id="entry-expense-amount"
                type="number"
                min="0"
                step="0.01"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-expense-currency">Currency</label>
              <input
                id="entry-expense-currency"
                value={expenseCurrency}
                onChange={(e) => setExpenseCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={3}
              />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-expense-status">Payment status</label>
              <input
                id="entry-expense-status"
                value={expensePaymentStatus}
                onChange={(e) => setExpensePaymentStatus(e.target.value)}
                placeholder="Paid / Unpaid / Partial"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-expense-note">Payment note</label>
              <input
                id="entry-expense-note"
                value={expensePaymentNote}
                onChange={(e) => setExpensePaymentNote(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="entry-contact-name">Contact name</label>
          <input id="entry-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="entry-contact-phone">Contact phone</label>
          <input id="entry-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="entry-contact-email">Contact email</label>
          <input id="entry-contact-email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="entry-notes">Notes</label>
        <textarea id="entry-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {mode === 'edit' && (
        <div className="field">
          <label htmlFor="entry-post-trip-notes">Post-Trip Notes</label>
          <textarea
            id="entry-post-trip-notes"
            value={postTripNotes}
            onChange={(e) => setPostTripNotes(e.target.value)}
            rows={2}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="entry-is-private" className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            id="entry-is-private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Private (hidden from Guests)
        </label>
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Entry' : 'Save changes'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-dark-outline" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
