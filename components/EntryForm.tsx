'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ENTRY_TYPE_LABELS, SUBTYPES_BY_ENTRY_TYPE, subtypeLabel } from '@/lib/entry-types/labels';
import { commitStagedLinks, LinkStagingList, type StagedLink } from '@/components/LinkStagingList';
import { DateTimeInput, combineDateTime, splitDateTime } from '@/components/DateTimeInput';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { useAutoEndDate } from '@/lib/hooks/useAutoEndDate';
import { entryEndpointClockTime, entryEndpointDateKey } from '@/lib/trip-status';

export type CreatableEntryType = 'STAY' | 'TRANSPORT' | 'ACTIVITY' | 'NOTE';

// expensePaymentStatus stays a free-text column server-side (see
// shared-fields.schema.ts) so no pre-existing value is ever rejected, but
// the UI narrows it to a closed Paid/Unpaid choice per user request --
// they'd been typing exactly "Paid" or "Unpaid" into the old free-text
// field already, so those are the two canonical values here.
const PAYMENT_STATUSES = [
  { value: 'Paid', label: 'Paid' },
  { value: 'Unpaid', label: 'Unpaid' },
] as const;

export interface EntryDTO {
  id: string;
  tripId: string;
  entryType: CreatableEntryType;
  subtype: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  // spec-timeline-ux-and-timezone (correction): NULL for every type but
  // Transport -- see TimelineEntry.startTimezone's own schema comment.
  startTimezone: string | null;
  endTimezone: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  bookingReference: string | null;
  website: string | null;
  bookedVia: string | null;
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
  // spec-timeline-ux-and-timezone (correction): seeds Transport's own
  // Departure/Arrival timezone pickers when neither is already set on
  // `entry` -- every other type ignores this entirely (no picker shown).
  tripTimezone: string;
  // User-reported: defaults a brand-new Entry's Start date to the Trip's
  // own first day, `YYYY-MM-DD` -- one fewer date-picker click for the
  // overwhelmingly common case of planning entries in trip order. Only
  // the date, never a time (that stays required and unset until the User
  // actually picks one). Ignored in edit mode (optional there, since
  // EntryDetailPanel's edit render never has a use for it) and whenever a
  // seed already carries its own startAt.
  tripStartDate?: string;
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

// `DateTimeInput` (and the raw `startAt`/`endAt` state it drives) works
// entirely in `YYYY-MM-DDTHH:mm` literal digits. `zone` is null for every
// type but Transport -- an Entry's own recorded time is then never
// converted through any timezone, the browser's or the Trip's own (see
// dateTimeField's comment for why), so pre-filling the edit form must read
// those literal digits back with UTC getters, not local ones -- a local
// read here would show the wrong clock time to anyone editing from a
// browser set to a different timezone than whoever created the Entry, and
// silently shift the value if they saved without noticing. `zone` non-null
// (Transport only, e.g. a flight's arrival airport) means the stored value
// is a real UTC instant that must be converted through that same zone to
// recover the correct pre-fill -- entryEndpointDateKey/entryEndpointClockTime
// (lib/trip-status.ts) resolve both cases identically to how the Timeline/
// EntryDetailPanel display them.
function toDateTimeLocal(iso: string | null, zone: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const dateKey = entryEndpointDateKey(date, zone);
  const { hour, minute } = entryEndpointClockTime(date, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateKey}T${pad(hour)}:${pad(minute)}`;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// User-requested redesign: every leg of a Transport entry -- including the
// first -- is one uniform Flight, mirroring
// lib/entry-types/transport.schema.ts's transportFlightLegSchema exactly.
// Deliberately plain strings straight from/to the DateTimeInput below, no
// ISO conversion -- see that schema's own comment on why flight times are
// never transformed to a Date server-side either, so there's no round-trip
// format mismatch to bridge here.
interface FlightDraft {
  departureLocation: string;
  departureAt: string;
  departureTimezone: string;
  arrivalLocation: string;
  arrivalAt: string;
  arrivalTimezone: string;
  flightNumber: string;
  terminal: string;
  gate: string;
  platform: string;
  seat: string;
}

// User-reported: Start/End already default a brand-new Entry's *date* to
// the Trip's own first day so their native date-pickers open on the right
// month (tripStartDate below) -- a new Flight's own Departure/Arrival
// pickers didn't get the same treatment and always opened on today's
// month instead. `dateOnly` carries that same default in here; still just
// `''` for an existing entry being edited (its Flights already have real
// dates) or when no Trip start date is known.
function blankFlight(tripTimezone: string, dateOnly = ''): FlightDraft {
  return {
    departureLocation: '',
    departureAt: dateOnly,
    departureTimezone: tripTimezone,
    arrivalLocation: '',
    arrivalAt: dateOnly,
    arrivalTimezone: tripTimezone,
    flightNumber: '',
    terminal: '',
    gate: '',
    platform: '',
    seat: '',
  };
}

function flightsFromSeed(
  seed: Partial<EntryDTO> | undefined,
  tripTimezone: string,
  mode: 'create' | 'edit',
  tripStartDate: string | undefined,
): FlightDraft[] {
  const typeDetails = seed?.typeDetails ?? {};
  const raw = typeDetails.flights;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      return {
        departureLocation: str(obj.departureLocation),
        departureAt: str(obj.departureAt),
        departureTimezone: str(obj.departureTimezone) || tripTimezone,
        arrivalLocation: str(obj.arrivalLocation),
        arrivalAt: str(obj.arrivalAt),
        arrivalTimezone: str(obj.arrivalTimezone) || tripTimezone,
        flightNumber: str(obj.flightNumber),
        terminal: str(obj.terminal),
        gate: str(obj.gate),
        platform: str(obj.platform),
        seat: str(obj.seat),
      };
    });
  }
  // An entry saved before the Flights redesign (plain top-level Departure/
  // Arrival + flat terminal/gate/platform/serviceNumber/seat, no `flights`
  // array yet) -- synthesize exactly one Flight from those. There's no
  // per-flight location data to recover from that old shape, so both stay
  // blank rather than guessing.
  if (seed?.entryType === 'TRANSPORT' && seed?.startAt) {
    return [
      {
        departureLocation: '',
        departureAt: toDateTimeLocal(seed.startAt, seed.startTimezone ?? null),
        departureTimezone: seed.startTimezone ?? tripTimezone,
        arrivalLocation: '',
        arrivalAt: seed.endAt ? toDateTimeLocal(seed.endAt, seed.endTimezone ?? null) : '',
        arrivalTimezone: seed.endTimezone ?? tripTimezone,
        flightNumber: str(typeDetails.serviceNumber),
        terminal: str(typeDetails.terminal),
        gate: str(typeDetails.gate),
        platform: str(typeDetails.platform),
        seat: str(typeDetails.seat),
      },
    ];
  }
  return [blankFlight(tripTimezone, mode === 'create' ? (tripStartDate ?? '') : '')];
}

// Read-only, computed display of the gap between one Flight's arrival and
// the next Flight's departure -- no longer separately entered data. Plain
// literal-clock-time comparison (no timezone math): a layover's own
// arrival and the next leg's departure happen at the same real airport in
// the overwhelming common case.
function stopoverGapLabel(prev: FlightDraft, next: FlightDraft): string {
  const location = prev.arrivalLocation.trim() || next.departureLocation.trim();
  const fmt = (value: string) => {
    const { hour, minute } = splitDateTime(value);
    return hour && minute ? `${hour}:${minute}` : '?';
  };
  return `⏱ Stopover${location ? ` at ${location}` : ''}: ${fmt(prev.arrivalAt)}–${fmt(next.departureAt)}`;
}

export function EntryForm({
  tripId,
  mode,
  tripTimezone,
  tripStartDate,
  entry,
  initialValues,
  apiUrl,
  onSaved,
  onCancel,
}: EntryFormProps) {
  const router = useRouter();
  // `entry` (edit mode) always wins; `initialValues` only ever seeds a
  // create-mode form (spec-ideas' convert step).
  const seed = entry ?? initialValues;
  const [entryType, setEntryType] = useState<CreatableEntryType>(seed?.entryType ?? 'ACTIVITY');
  const [subtype, setSubtype] = useState(seed?.subtype ?? '');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [startAt, setStartAt] = useState(
    seed?.startAt
      ? toDateTimeLocal(seed.startAt, seed.startTimezone ?? null)
      : mode === 'create'
        ? (tripStartDate ?? '')
        : '',
  );
  // User-reported: Start now defaults its *date* to the Trip's own first
  // day, so its native date-picker opens already on the right month --
  // but End was left blank, so *its* picker still opened on today's month
  // instead (many clicks away when planning a trip months out). End
  // mirrors Start's own initial seed here for exactly the same reason;
  // the existing auto-follow wiring below (autoEndDate) still updates it
  // to match whatever the User actually picks for Start, unchanged.
  const [endAt, setEndAt] = useState(
    seed?.endAt
      ? toDateTimeLocal(seed.endAt, seed.endTimezone ?? null)
      : mode === 'create'
        ? (tripStartDate ?? '')
        : '',
  );
  const [locationName, setLocationName] = useState(seed?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(seed?.locationAddress ?? '');
  const [locationMapLink, setLocationMapLink] = useState(seed?.locationMapLink ?? '');
  const [bookingReference, setBookingReference] = useState(seed?.bookingReference ?? '');
  const [website, setWebsite] = useState(seed?.website ?? '');
  const [bookedVia, setBookedVia] = useState(seed?.bookedVia ?? '');
  const [expenseAmount, setExpenseAmount] = useState(
    seed?.expenseAmount != null ? String(seed.expenseAmount) : '',
  );
  // spec-entry-fields-datepickers: SEK only pre-fills a brand-new Entry's
  // Expense currency -- edit mode always shows the already-stored value
  // (including an empty one), never overridden by the default.
  const [expenseCurrency, setExpenseCurrency] = useState(
    seed?.expenseCurrency ?? (mode === 'create' ? 'SEK' : ''),
  );
  // spec-entry-fields-datepickers: distinguishes "still showing the SEK
  // default the User never touched" from "a real currency value" -- without
  // this, a brand-new Entry with nothing but the SEK default and no Expense
  // amount would look identical to someone deliberately typing a currency
  // with no amount, and 400 ("Expense requires both an amount and a
  // currency") the moment the Expense section is otherwise left alone
  // (FR-22's both-or-neither rule must stay about what the User actually
  // entered, not about this new pre-fill). Already-true whenever the
  // currency reflects real data rather than the bare default: edit mode, or
  // a create-mode seed carrying its own value (e.g. an Idea's estimated
  // expense currency).
  const [currencyTouched, setCurrencyTouched] = useState(
    mode !== 'create' || seed?.expenseCurrency != null,
  );
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
  // spec-tags-links-photos: create-mode-only staging (see
  // LinkStagingList.tsx's own comment) -- edit mode already has Links on
  // its own separate, already-existing detail view (EntryDetailPanel's
  // LinkList), so this stays unmounted there rather than offering two
  // different Links UIs on the same Entry at once.
  const [stagedLinks, setStagedLinks] = useState<StagedLink[]>([]);

  const typeDetails = seed?.typeDetails ?? {};
  const [roomInfo, setRoomInfo] = useState(str(typeDetails.roomInfo));
  const [baggageInfo, setBaggageInfo] = useState(str(typeDetails.baggageInfo));
  const [flights, setFlights] = useState<FlightDraft[]>(() =>
    flightsFromSeed(seed, tripTimezone, mode, tripStartDate),
  );

  function addFlight() {
    setFlights((current) => [
      ...current,
      blankFlight(tripTimezone, mode === 'create' ? (tripStartDate ?? '') : ''),
    ]);
  }
  function updateFlight(index: number, patch: Partial<FlightDraft>) {
    setFlights((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function removeFlight(index: number) {
    setFlights((current) => current.filter((_, i) => i !== index));
  }

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // spec-entry-fields-datepickers: End auto-follows Start until the User
  // explicitly picks their own End -- already "used up" the moment this
  // form instance is seeded with an existing End (edit mode, or an
  // Idea-conversion seed that happens to carry one).
  const autoEndDate = useAutoEndDate(!!seed?.endAt);

  // FR-14: a Note carries no Location, Expense, or booking-reference
  // fields at all -- hidden here, and never sent to the API for this type.
  const showLocation = entryType !== 'NOTE';
  const showBookingExpense = entryType !== 'NOTE';
  // Transport no longer shows a top-level End input at all -- Flight 1's
  // own arrival becomes the entry's endAt (computed in handleSubmit).
  const showEnd = entryType !== 'NOTE' && entryType !== 'TRANSPORT';
  const endRequired = entryType === 'STAY';
  const subtypeOptions = SUBTYPES_BY_ENTRY_TYPE[entryType] ?? [];
  // spec-entry-fields-datepickers: Stay/Transport/Activity no longer show a
  // separate Title input (showLocation is exactly this 3-type set within
  // this form -- Note is the only type without Location) -- Location name
  // doubles as the Entry's title instead, required for exactly these types.
  const titleFromLocation = showLocation;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Transport's own startAt/endAt are no longer directly editable --
    // they're computed from the first/last Flight that actually has both
    // of its own times set, matching what the User can see on-screen.
    const validFlights = entryType === 'TRANSPORT' ? flights.filter((f) => f.departureAt && f.arrivalAt) : [];
    if (entryType === 'TRANSPORT' && validFlights.length === 0) {
      setError('At least one Flight needs both a departure and arrival date/time.');
      return;
    }
    const effectiveStartAt = entryType === 'TRANSPORT' ? validFlights[0].departureAt : startAt;
    const effectiveEndAt = entryType === 'TRANSPORT' ? validFlights[validFlights.length - 1].arrivalAt : endAt;

    if (!effectiveStartAt) {
      setError('A start date/time is required.');
      return;
    }
    if (entryType !== 'NOTE' && !subtype) {
      setError('Please choose an Entry Subtype.');
      return;
    }
    if (endRequired && !effectiveEndAt) {
      setError('Check-out is required.');
      return;
    }
    if (titleFromLocation && !locationName.trim()) {
      setError('Location name is required.');
      return;
    }

    // spec-entry-fields-datepickers: Stay/Transport/Activity send Location
    // name as both `title` and `locationName` (the form no longer shows a
    // separate Title input for these types) -- Note keeps its own
    // independent Title (FR-14, no Location fields at all for Note).
    const effectiveTitle = titleFromLocation ? locationName : title;

    const body: Record<string, unknown> = {
      title: effectiveTitle,
      description: description || null,
      // Sent as the raw `YYYY-MM-DDTHH:mm` literal, not routed through a
      // client-side `Date` object -- `new Date(startAt).toISOString()`
      // would silently reinterpret it in the *submitting browser's own*
      // local timezone before converting to UTC, corrupting the literal
      // digits the traveler just typed. `dateTimeField` (lib/validation.ts)
      // treats an unzoned datetime string as UTC, so sending it as-is
      // stores exactly what was typed, with zero timezone involved.
      startAt: effectiveStartAt,
      notes: notes || null,
      postTripNotes: postTripNotes || null,
    };

    if (entryType === 'TRANSPORT') {
      // Always sent, never gated by `showEnd` (Transport no longer renders
      // that field at all) -- Flight 1's own arrival is always required.
      body.endAt = effectiveEndAt;
    } else if (showEnd) {
      // Send `endAt` whenever this type shows the field at all -- both a
      // new literal value and an explicit clear (`null`) so blanking the
      // field on edit actually clears it server-side instead of leaving
      // the stale stored value in place. Same raw-literal reasoning as
      // `startAt` above.
      body.endAt = endAt || null;
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
      body.website = website || null;
      body.bookedVia = bookedVia || null;

      const amountEntered = expenseAmount.trim() !== '';
      // spec-entry-fields-datepickers: the untouched SEK default alone never
      // counts as "entered" -- only a real currency value does (the User
      // explicitly set/changed it, or an amount was also entered, which
      // makes the still-showing default a deliberate part of this submit).
      const currencyEntered = expenseCurrency.trim() !== '' && (currencyTouched || amountEntered);
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
        baggageInfo: baggageInfo || null,
        flights: validFlights.map((f) => ({
          departureLocation: f.departureLocation.trim() || null,
          departureAt: f.departureAt,
          departureTimezone: f.departureTimezone || tripTimezone,
          arrivalLocation: f.arrivalLocation.trim() || null,
          arrivalAt: f.arrivalAt,
          arrivalTimezone: f.arrivalTimezone || tripTimezone,
          flightNumber: f.flightNumber.trim() || null,
          terminal: f.terminal.trim() || null,
          gate: f.gate.trim() || null,
          platform: f.platform.trim() || null,
          seat: f.seat.trim() || null,
        })),
      };
      // spec-timeline-ux-and-timezone (correction): only Transport's own
      // schema accepts these fields -- every other type's `.strict()`
      // schema would 400 on an unexpected key, so this must stay inside
      // the TRANSPORT branch. The entry's own startTimezone/endTimezone
      // now come from Flight 1's departure and the last Flight's arrival
      // (never `''`, which TimezoneSelect emits only mid-typing before a
      // selection commits -- falls back to the Trip's own timezone so an
      // in-progress, uncommitted edit never accidentally submits a blank
      // zone); the Route Handler computes the real UTC instant from this
      // plus the literal `startAt`/`endAt` above.
      body.startTimezone = validFlights[0].departureTimezone || tripTimezone;
      body.endTimezone = validFlights[validFlights.length - 1].arrivalTimezone || tripTimezone;
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
        if (stagedLinks.length > 0) {
          await commitStagedLinks('TIMELINE_ENTRY', responseBody.id, stagedLinks);
        }
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

      {!titleFromLocation && (
        <div className="field">
          <label htmlFor="entry-title">Title</label>
          <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
      )}

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

      {entryType !== 'TRANSPORT' && (
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="entry-start">{entryType === 'STAY' ? 'Check-in' : 'Start'}</label>
            <DateTimeInput
              id="entry-start"
              value={startAt}
              // User-reported: "Check-in/out time should not be mandatory"
              // -- every type can save with just a date, no specific time
              // (not just Activity, per the original "Big Buddha" ask).
              timeRequired={false}
              onChange={(value) => {
                setStartAt(value);
                // spec-entry-fields-datepickers: End auto-follows Start until
                // the User explicitly picks their own End.
                if (!autoEndDate.touched()) setEndAt(value);
              }}
              required
            />
          </div>
          {showEnd && (
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-end">{entryType === 'STAY' ? 'Check-out' : 'End (optional)'}</label>
              <DateTimeInput
                id="entry-end"
                value={endAt}
                onChange={(value) => {
                  // review-caught: only a genuinely complete End value counts
                  // as a deliberate choice -- DateTimeInput collapses an
                  // incomplete/abandoned selection (e.g. an hour picked but no
                  // date yet) to '', which must not permanently disarm
                  // auto-fill.
                  if (value) autoEndDate.markTouched();
                  // User-reported: an overnight Check-out time is the single
                  // most common reason End ends up <= Start -- the End date
                  // auto-filled to match Start's and the User only meant to
                  // pick a *time*, not realizing they also needed to bump the
                  // date forward. Silently roll the date forward one day
                  // whenever that exact shape occurs (End's date is still the
                  // untouched auto-filled Start date, and the time picked
                  // makes End <= Start) -- this is never wrong: a same-day
                  // End that's genuinely earlier than Start is otherwise
                  // always just a data-entry mistake, not a valid state
                  // (Stay/Activity both require End later than, or for
                  // Activity only, equal to, Start). A deliberate same-day
                  // End that's *later* than Start (a day-use booking) never
                  // reaches this branch at all, since only value <= startAt
                  // triggers it.
                  // Activity alone allows End to equal Start (a point-in-time
                  // Activity) -- only a strictly-earlier End is ever invalid
                  // there; every other type requires strictly later.
                  const wouldBeInvalid = startAt
                    ? entryType === 'ACTIVITY'
                      ? value < startAt
                      : value <= startAt
                    : false;
                  if (value && wouldBeInvalid) {
                    const { date, hour, minute } = splitDateTime(value);
                    if (date === splitDateTime(startAt).date) {
                      const nextDay = new Date(`${date}T00:00:00.000Z`);
                      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                      // timeRequired: false, matching the DateTimeInput below
                      // -- a date-only End (no specific time picked) must
                      // still roll forward as a bare date, not collapse to
                      // '' for lacking an hour/minute it was never given.
                      setEndAt(combineDateTime(nextDay.toISOString().slice(0, 10), hour, minute, false));
                      return;
                    }
                  }
                  setEndAt(value);
                }}
                required={endRequired}
                timeRequired={false}
              />
            </div>
          )}
        </div>
      )}

      {showLocation && (
        <>
          <div className="field">
            <label htmlFor="entry-location-name">Location name</label>
            <input
              id="entry-location-name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              required={titleFromLocation}
            />
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
          {/* User-requested redesign: every leg -- including the first --
              is one uniform Flight card, instead of a full-fields first
              leg plus bare-bones stopovers for the rest. The gap between
              two Flights is shown as a computed, read-only line rather
              than separately entered data. */}
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
              Flights
            </span>
            {flights.map((flight, index) => (
              <div key={index} className="stack" style={{ gap: 'var(--space-2)' }}>
                <div className="card stack" style={{ padding: 'var(--space-2)', gap: 'var(--space-2)' }}>
                  <div className="row-between">
                    <span className="text-soft" style={{ fontSize: '0.85rem' }}>
                      Flight {index + 1}
                    </span>
                    {index > 0 && (
                      <button
                        type="button"
                        className="btn-danger"
                        style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
                        onClick={() => removeFlight(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-dep-location`}>Departure location</label>
                      <input
                        id={`entry-flight-${index}-dep-location`}
                        value={flight.departureLocation}
                        onChange={(e) => updateFlight(index, { departureLocation: e.target.value })}
                        placeholder="e.g. Stockholm (ARN)"
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-arr-location`}>Arrival location</label>
                      <input
                        id={`entry-flight-${index}-arr-location`}
                        value={flight.arrivalLocation}
                        onChange={(e) => updateFlight(index, { arrivalLocation: e.target.value })}
                        placeholder="e.g. Phuket (HKT)"
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-departure`}>Departure</label>
                      <DateTimeInput
                        id={`entry-flight-${index}-departure`}
                        value={flight.departureAt}
                        timeRequired={false}
                        onChange={(value) => updateFlight(index, { departureAt: value })}
                        required
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-arrival`}>Arrival</label>
                      <DateTimeInput
                        id={`entry-flight-${index}-arrival`}
                        value={flight.arrivalAt}
                        timeRequired={false}
                        onChange={(value) => updateFlight(index, { arrivalAt: value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-dep-tz`}>Departure timezone</label>
                      <TimezoneSelect
                        id={`entry-flight-${index}-dep-tz`}
                        initialValue={flight.departureTimezone}
                        onChange={(value) => updateFlight(index, { departureTimezone: value })}
                        required
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-arr-tz`}>Arrival timezone</label>
                      <TimezoneSelect
                        id={`entry-flight-${index}-arr-tz`}
                        initialValue={flight.arrivalTimezone}
                        onChange={(value) => updateFlight(index, { arrivalTimezone: value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-number`}>Flight number</label>
                      <input
                        id={`entry-flight-${index}-number`}
                        value={flight.flightNumber}
                        onChange={(e) => updateFlight(index, { flightNumber: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-terminal`}>Terminal</label>
                      <input
                        id={`entry-flight-${index}-terminal`}
                        value={flight.terminal}
                        onChange={(e) => updateFlight(index, { terminal: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-gate`}>Gate</label>
                      <input
                        id={`entry-flight-${index}-gate`}
                        value={flight.gate}
                        onChange={(e) => updateFlight(index, { gate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-platform`}>Platform</label>
                      <input
                        id={`entry-flight-${index}-platform`}
                        value={flight.platform}
                        onChange={(e) => updateFlight(index, { platform: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor={`entry-flight-${index}-seat`}>Seat</label>
                      <input
                        id={`entry-flight-${index}-seat`}
                        value={flight.seat}
                        onChange={(e) => updateFlight(index, { seat: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                {index < flights.length - 1 && (
                  <div className="text-soft" style={{ fontSize: '0.85rem' }}>
                    {stopoverGapLabel(flight, flights[index + 1])}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-outline" onClick={addFlight}>
              + Add flight
            </button>
          </div>

          <div className="field">
            <label htmlFor="entry-baggage">Baggage info</label>
            <input id="entry-baggage" value={baggageInfo} onChange={(e) => setBaggageInfo(e.target.value)} />
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
              <label htmlFor="entry-website">Website</label>
              <input
                id="entry-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-booked-via">Booked via</label>
              <input
                id="entry-booked-via"
                value={bookedVia}
                onChange={(e) => setBookedVia(e.target.value)}
                placeholder="Booking.com"
              />
            </div>
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
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setExpenseCurrency(value);
                  // review-caught: only count this as "the User entered a
                  // currency" if the field's value actually differs from
                  // the untouched SEK default -- otherwise clicking into
                  // the field and tabbing back out (or retyping the same
                  // "SEK") would permanently flip this to true, and then an
                  // Entry saved with no Expense amount would send
                  // `expenseCurrency: 'SEK'` alone and trip FR-22's
                  // both-or-neither rule for what looked like an unrelated,
                  // no-op interaction.
                  setCurrencyTouched(value !== 'SEK');
                }}
                placeholder="USD"
                maxLength={3}
              />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="entry-expense-status">Payment status</label>
              <select
                id="entry-expense-status"
                value={expensePaymentStatus}
                onChange={(e) => setExpensePaymentStatus(e.target.value)}
              >
                <option value="">Not set</option>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
                {/* Preserve any pre-existing value outside the closed set above
                    (e.g. an old "Partial") instead of silently discarding it
                    the moment this form is opened and saved. */}
                {expensePaymentStatus && !PAYMENT_STATUSES.some((s) => s.value === expensePaymentStatus) && (
                  <option value={expensePaymentStatus}>{expensePaymentStatus}</option>
                )}
              </select>
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

      {mode === 'create' && <LinkStagingList links={stagedLinks} onChange={setStagedLinks} />}

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
