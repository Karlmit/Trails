import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, dateKeyInTimezone, dateKeyOfDateColumn } from '@/lib/trip-status';
import { sectionIndexForDateKey } from '@/lib/timeline';
import { timelineVisibleEntryWhere, entryDetailHref } from '@/lib/entry-types';
import { ENTRY_TYPE_LABELS, subtypeLabel } from '@/lib/entry-types/labels';
import { findCurrentActivity, findCurrentStay, findNextByType, entryMapsUrl } from '@/lib/travel-mode';
import { isUuid } from '@/lib/uuid';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

interface TravelModeEntryRow {
  id: string;
  entryType: string;
  subtype: string | null;
  title: string;
  startAt: Date;
  endAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
}

// An Entry's own recorded startAt is its literal wall-clock digits (see
// dateTimeField's comment) -- pinned to UTC explicitly here so the
// formatted time is always exactly what the traveler typed, never
// re-localized through the Trip's own declared timezone.
function formatEntryTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// FR-27, spec-travel-mode: pure read/aggregation view (no new Prisma model,
// no cached "current"/"next" -- AD-3) showing what's happening right now on
// this Trip and what's next, plus quick-access links. Same "Server
// Component reads Prisma directly, lib/*.ts does the pure computation"
// split as Budget/Documents. Reached either via the ACTIVE-only launch
// button in layout.tsx, or directly (e.g. a stale bookmark) -- this route
// itself is never hard-404'd for a non-Active Trip (no other page in this
// app gates by Trip Status today); it just shows a plain message instead of
// CURRENT/NEXT.
export default async function TravelModePage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const now = new Date();
  const status = computeTripStatus(trip, now);

  if (status !== 'ACTIVE') {
    return (
      <main className="page">
        <h2 style={{ margin: 0 }}>Travel Mode</h2>
        <p className="text-soft">
          {status === 'UPCOMING' ? "This Trip hasn't started yet." : 'This Trip has ended.'}
        </p>
        <Link href={`/trips/${tripId}/timeline`} className="btn btn-outline">
          Back to Timeline
        </Link>
      </main>
    );
  }

  const [sections, entries] = await Promise.all([
    prisma.section.findMany({ where: { tripId }, orderBy: { startDate: 'asc' } }),
    // AD-10: exclude Draft Blog Posts the same way the Timeline/Budget do --
    // `timelineVisibleEntryWhere()`, the one shared predicate, not
    // reimplemented here.
    prisma.timelineEntry.findMany({
      where: { tripId, ...timelineVisibleEntryWhere() },
      // `id` as a secondary sort key makes the "earliest startAt wins" tie-
      // break in lib/travel-mode.ts deterministic across requests -- without
      // it, two entries sharing an identical startAt would tie-break on
      // Postgres's unspecified same-value ordering instead.
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        entryType: true,
        subtype: true,
        title: true,
        startAt: true,
        endAt: true,
        locationName: true,
        locationAddress: true,
      },
    }),
  ]);

  const timezone = trip.timezone;
  const todayKey = dateKeyInTimezone(now, timezone);
  const currentSectionIndex = sectionIndexForDateKey(todayKey, sections);
  const currentSection = currentSectionIndex === null ? null : sections[currentSectionIndex];

  const currentStay = findCurrentStay<TravelModeEntryRow>(entries, now, timezone);
  const currentActivity = findCurrentActivity<TravelModeEntryRow>(entries, now, timezone);

  const nextOverall = findNextByType<TravelModeEntryRow>(entries, now, timezone);
  const nextTransport = findNextByType<TravelModeEntryRow>(entries, now, timezone, 'TRANSPORT');
  const nextActivity = findNextByType<TravelModeEntryRow>(entries, now, timezone, 'ACTIVITY');
  const nextStay = findNextByType<TravelModeEntryRow>(entries, now, timezone, 'STAY');

  // Quick-access "today's full itinerary": every visible entry whose own
  // literal calendar date (never re-localized through any timezone -- see
  // dateTimeField's comment) equals todayKey (real-time-based, correctly
  // localized to the Trip's own timezone), rendered as a simple list on
  // this page rather than a separate route.
  const todaysEntries = entries
    .filter((entry) => dateKeyOfDateColumn(entry.startAt) === todayKey)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  function EntryRow({ entry }: { entry: TravelModeEntryRow }) {
    const mapsUrl = entryMapsUrl(entry);
    return (
      <div className="row-between">
        <div className="stack" style={{ gap: 0 }}>
          <Link href={entryDetailHref(tripId, entry.entryType, entry.id)}>{entry.title}</Link>
          <span className="text-soft">
            {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
            {entry.subtype ? ` · ${subtypeLabel(entry.subtype)}` : ''} ·{' '}
            {formatEntryTime(entry.startAt)}
          </span>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
            Map
          </a>
        )}
      </div>
    );
  }

  return (
    <main className="page">
      <h2 style={{ margin: 0 }}>Travel Mode</h2>
      <p className="text-soft">What&rsquo;s happening now, and what&rsquo;s next.</p>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Current</h3>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Section
          </div>
          <div>{currentSection ? currentSection.name : 'No Section covers today'}</div>
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Stay
          </div>
          {currentStay ? <EntryRow entry={currentStay} /> : <div className="text-soft">Nothing right now</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Activity
          </div>
          {currentActivity ? (
            <EntryRow entry={currentActivity} />
          ) : (
            <div className="text-soft">Nothing right now</div>
          )}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Next</h3>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Next up
          </div>
          {nextOverall ? <EntryRow entry={nextOverall} /> : <div className="text-soft">Nothing left on this Trip</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Next Transport
          </div>
          {nextTransport ? <EntryRow entry={nextTransport} /> : <div className="text-soft">None scheduled</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Next Activity
          </div>
          {nextActivity ? <EntryRow entry={nextActivity} /> : <div className="text-soft">None scheduled</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Next Stay
          </div>
          {nextStay ? <EntryRow entry={nextStay} /> : <div className="text-soft">None scheduled</div>}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Quick access</h3>
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href={`/trips/${tripId}/documents`} className="btn btn-outline">
            Documents
          </Link>
          <Link href={`/trips/${tripId}/important-info`} className="btn btn-outline">
            Important Info
          </Link>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Today&rsquo;s full itinerary</h3>
        {todaysEntries.length === 0 ? (
          <div className="empty-state">Nothing on the Timeline for today.</div>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {todaysEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
