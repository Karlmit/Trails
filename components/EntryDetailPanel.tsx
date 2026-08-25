'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EntryForm, type EntryDTO } from '@/components/EntryForm';
import { AttachmentList } from '@/components/AttachmentList';
import { TagList } from '@/components/TagList';
import { LinkList } from '@/components/LinkList';
import { PhotoGallery, type PhotoDTO } from '@/components/PhotoGallery';
import { ENTRY_TYPE_LABELS, subtypeLabel } from '@/lib/entry-types/labels';
import { entryTypeColor } from '@/lib/entry-types/colors';
import {
  entryEndpointClockTime,
  formatEntryEndpointDateOnly,
  formatEntryEndpointDateTime,
  timezoneDisclosure,
} from '@/lib/trip-status';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

// User-reported: "Check-in/out time should not be mandatory" -- every
// type's Start/End can now be saved with no specific time (DateTimeInput's
// `timeRequired={false}`, EntryForm.tsx), but still needs *some* stored
// clock time (TimelineEntry.startAt/endAt are never nullable) -- midnight
// is the sentinel. Showing "12:00 AM"/"00:00" back to the User who
// deliberately left it blank would look like a fabricated, wrong time, so
// it's hidden here whenever the stored time is exactly midnight,
// regardless of Entry Type (a genuine literal-midnight time is
// indistinguishable from "none given" -- the same accepted tradeoff this
// app already makes everywhere else it reads an Entry's own time).
function hasNoSpecificTime(date: string, zone: string | null): boolean {
  const { hour, minute } = entryEndpointClockTime(new Date(date), zone);
  return hour === 0 && minute === 0;
}

interface FlightDTO {
  departureLocation: string | null;
  departureAt: string;
  departureTimezone: string | null;
  arrivalLocation: string | null;
  arrivalAt: string;
  arrivalTimezone: string | null;
  flightNumber: string | null;
  terminal: string | null;
  gate: string | null;
  platform: string | null;
  seat: string | null;
}

// User-requested redesign: every leg of a Transport entry
// (lib/entry-types/transport.schema.ts's `flights`) is one uniform Flight.
// `departureAt`/`arrivalAt` are deliberately plain, never converted to a
// real Date server-side (that schema's own comment) -- but the *client*
// that wrote them isn't necessarily this one: the Android app's own
// date-time picker emits a full `Instant.toString()` (seconds + trailing
// "Z"), while this web form's DateTimeInput emits bare `YYYY-MM-DDTHH:mm`.
// Both are valid literal-digit representations of the same moment, so
// parsing pulls the digits out with a regex rather than assuming either
// exact shape.
function formatFlightTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

function flightDetailsLine(
  flight: FlightDTO,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  const parts = [
    flight.terminal && t('terminalValue', { terminal: flight.terminal }),
    flight.gate && t('gateValue', { gate: flight.gate }),
    flight.platform && t('platformValue', { platform: flight.platform }),
    flight.seat && t('seatValue', { seat: flight.seat }),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// FR-11-FR-15: view/edit/delete a single Entry. Same view<->edit toggle
// pattern as TripOverviewPanel/EditTripForm, plus an inline delete action
// (DeleteTripButton's pattern) rather than three separate components, since
// this panel is only ever mounted on the one Entry detail page.
export function EntryDetailPanel({
  tripId,
  entry: initialEntry,
  readOnly = false,
  photos,
  tripTimezone,
}: {
  tripId: string;
  entry: EntryDTO;
  // spec-guest-access: hides Edit/Delete (and the AttachmentList's
  // upload/delete affordances) entirely for a Guest -- not merely disabled,
  // not present in the DOM at all.
  readOnly?: boolean;
  // spec-tags-links-photos: server-fetched, already `filterForViewer`-
  // filtered Photos (app/(web)/trips/[tripId]/entries/[entryId]/page.tsx) --
  // required for a Guest, whose session-less browser can't self-fetch
  // GET /api/v1/photos. See PhotoGallery's own `initialPhotos` comment.
  photos?: PhotoDTO[];
  // spec-timeline-ux-and-timezone (correction): seeds the edit form's
  // Transport Departure/Arrival timezone pickers, and is the baseline
  // Start/End's own timezone disclosure compares against (a leg's zone is
  // only ever shown in parens when it differs from this).
  tripTimezone: string;
}) {
  const t = useTranslations('errors');
  const tEntries = useTranslations('tripEntries');
  const router = useRouter();
  const [entry, setEntry] = useState(initialEntry);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(tEntries('confirmDeleteEntry', { title: entry.title }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/timeline-entries/${entry.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? tEntries('errorCouldNotDelete'));
        return;
      }
      router.push(`/trips/${tripId}/timeline`);
      router.refresh();
    } catch {
      setError(tEntries('errorNetworkError'));
    } finally {
      setBusy(false);
    }
  }

  if (editing && !readOnly) {
    return (
      <EntryForm
        tripId={tripId}
        mode="edit"
        entry={entry}
        tripTimezone={tripTimezone}
        onSaved={(updated) => {
          setEntry(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="stack">
      {error && <div className="form-error-banner">{error}</div>}
      <div className="card stack">
        <div className="row-between">
          <div>
            <span
              className="badge"
              style={{ background: entryTypeColor(entry.entryType), color: '#fff' }}
            >
              {ENTRY_TYPE_LABELS[entry.entryType]}
            </span>
            {entry.subtype && (
              <span className="text-soft" style={{ marginLeft: 'var(--space-2)' }}>
                {subtypeLabel(entry.subtype)}
              </span>
            )}
          </div>
          {!readOnly && (
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
                {tEntries('editButton')}
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                {busy ? tEntries('deletingButton') : tEntries('deleteButton')}
              </button>
            </div>
          )}
        </div>

        <h2 style={{ margin: 0 }}>{entry.title}</h2>
        {entry.description && (
          <p className="text-soft text-multiline" style={{ margin: 0 }}>
            {entry.description}
          </p>
        )}

        <dl className="row" style={{ gap: 'var(--space-6)' }}>
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {entry.entryType === 'TRANSPORT'
                ? tEntries('departureLabel')
                : entry.entryType === 'STAY'
                  ? tEntries('checkInLabel')
                  : tEntries('startLabel')}
            </dt>
            <dd style={{ margin: 0 }}>
              {hasNoSpecificTime(entry.startAt, entry.startTimezone) ? (
                formatEntryEndpointDateOnly(new Date(entry.startAt), entry.startTimezone)
              ) : (
                <>
                  {formatEntryEndpointDateTime(new Date(entry.startAt), entry.startTimezone)}
                  {timezoneDisclosure(entry.startTimezone, tripTimezone)}
                </>
              )}
            </dd>
          </div>
          {entry.endAt && (
            <div>
              <dt className="text-soft" style={FIELD_LABEL_STYLE}>
                {entry.entryType === 'TRANSPORT'
                  ? tEntries('arrivalLabel')
                  : entry.entryType === 'STAY'
                    ? tEntries('checkOutLabel')
                    : tEntries('endLabel')}
              </dt>
              <dd style={{ margin: 0 }}>
                {hasNoSpecificTime(entry.endAt, entry.endTimezone) ? (
                  formatEntryEndpointDateOnly(new Date(entry.endAt), entry.endTimezone)
                ) : (
                  <>
                    {formatEntryEndpointDateTime(new Date(entry.endAt), entry.endTimezone)}
                    {timezoneDisclosure(entry.endTimezone, tripTimezone)}
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>

        {entry.entryType === 'TRANSPORT' &&
          Array.isArray(entry.typeDetails?.flights) &&
          (entry.typeDetails.flights as FlightDTO[]).length > 1 && (
            <div>
              <dt className="text-soft" style={FIELD_LABEL_STYLE}>
                {tEntries('itineraryLabel')}
              </dt>
              <dd className="stack" style={{ margin: 0, gap: 'var(--space-2)' }}>
                {(() => {
                  const flights = entry.typeDetails.flights as FlightDTO[];
                  return flights.map((flight, index) => (
                    <div key={index} className="stack" style={{ gap: 'var(--space-1)' }}>
                      <div>
                        ✈ {flight.flightNumber || tEntries('flightNumberFallback', { number: index + 1 })}
                        {flightDetailsLine(flight, tEntries) && (
                          <span className="text-soft"> · {flightDetailsLine(flight, tEntries)}</span>
                        )}
                      </div>
                      <div className="text-soft">
                        {[flight.departureLocation, formatFlightTime(flight.departureAt)].filter(Boolean).join(' ')}
                        {' → '}
                        {[flight.arrivalLocation, formatFlightTime(flight.arrivalAt)].filter(Boolean).join(' ')}
                      </div>
                      {index < flights.length - 1 &&
                        (() => {
                          const next = flights[index + 1];
                          const location = flight.arrivalLocation || next.departureLocation;
                          const from = formatFlightTime(flight.arrivalAt);
                          const to = formatFlightTime(next.departureAt);
                          return (
                            <div className="text-soft">
                              {location
                                ? tEntries('stopoverWithLocation', { location, from, to })
                                : tEntries('stopoverNoLocation', { from, to })}
                            </div>
                          );
                        })()}
                    </div>
                  ));
                })()}
              </dd>
            </div>
          )}

        {(entry.locationName || entry.locationAddress) && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('locationLabel')}
            </dt>
            <dd style={{ margin: 0 }}>
              {[entry.locationName, entry.locationAddress].filter(Boolean).join(' — ')}
              {entry.locationMapLink && (
                <>
                  {' '}
                  <a href={entry.locationMapLink} target="_blank" rel="noreferrer">
                    {tEntries('openMapLink')}
                  </a>
                </>
              )}
            </dd>
          </div>
        )}

        {entry.bookingReference && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('bookingReferenceLabel')}
            </dt>
            <dd style={{ margin: 0 }}>{entry.bookingReference}</dd>
          </div>
        )}

        {entry.website && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('websiteLabel')}
            </dt>
            <dd style={{ margin: 0 }}>
              <a href={entry.website} target="_blank" rel="noreferrer">
                {entry.website}
              </a>
            </dd>
          </div>
        )}

        {entry.bookedVia && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('bookedViaLabel')}
            </dt>
            <dd style={{ margin: 0 }}>{entry.bookedVia}</dd>
          </div>
        )}

        {entry.expenseAmount != null && entry.expenseCurrency && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('expenseLabel')}
            </dt>
            <dd style={{ margin: 0 }}>
              {entry.expenseAmount} {entry.expenseCurrency}
              {entry.expensePaymentStatus ? ` · ${entry.expensePaymentStatus}` : ''}
            </dd>
          </div>
        )}

        {(entry.contactName || entry.contactPhone || entry.contactEmail) && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('contactLabel')}
            </dt>
            <dd style={{ margin: 0 }}>
              {[entry.contactName, entry.contactPhone, entry.contactEmail].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}

        {entry.notes && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('notesLabel')}
            </dt>
            <dd className="text-multiline" style={{ margin: 0 }}>{entry.notes}</dd>
          </div>
        )}

        {entry.postTripNotes && (
          <div>
            <dt className="text-soft" style={FIELD_LABEL_STYLE}>
              {tEntries('postTripNotesLabel')}
            </dt>
            <dd className="text-multiline" style={{ margin: 0 }}>{entry.postTripNotes}</dd>
          </div>
        )}

        {!readOnly && <TagList ownerType="TIMELINE_ENTRY" ownerId={entry.id} />}
        {!readOnly && <LinkList ownerType="TIMELINE_ENTRY" ownerId={entry.id} />}
        <PhotoGallery
          tripId={tripId}
          ownerType="TIMELINE_ENTRY"
          ownerId={entry.id}
          readOnly={readOnly}
          initialPhotos={photos}
        />

        {!readOnly && (
          <AttachmentList tripId={tripId} ownerType="TIMELINE_ENTRY" ownerId={entry.id} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}
