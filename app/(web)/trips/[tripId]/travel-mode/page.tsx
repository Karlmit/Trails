import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, dateKeyInTimezone, entryEndpointDateKey, timezoneDisclosure } from '@/lib/trip-status';
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
  startTimezone: string | null;
  locationName: string | null;
  locationAddress: string | null;
}

// An Entry's own recorded startAt is its literal wall-clock digits (see
// dateTimeField's comment) by default -- `zone` null pins the format to UTC
// explicitly so it's always exactly what the traveler typed, never
// re-localized through the Trip's own declared timezone. `zone` non-null
// (Transport only, e.g. a flight's departure airport) means the stored
// value is a real UTC instant, converted through that zone instead. That
// zone is disclosed in parens whenever it differs from the Trip's own.
function formatEntryTime(date: Date, zone: string | null, tripTimezone: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: zone ?? 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${formatted}${timezoneDisclosure(zone, tripTimezone)}`;
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

  const t = await getTranslations('tripTravelMode');

  const now = new Date();
  const status = computeTripStatus(trip, now);

  if (status !== 'ACTIVE') {
    return (
      <main className="page">
        <h2 style={{ margin: 0 }}>{t('title')}</h2>
        <p className="text-soft">{status === 'UPCOMING' ? t('notStartedYet') : t('hasEnded')}</p>
        <Link href={`/trips/${tripId}/timeline`} className="btn btn-outline">
          {t('backToTimeline')}
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
        startTimezone: true,
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
    .filter((entry) => entryEndpointDateKey(entry.startAt, entry.startTimezone) === todayKey)
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
            {formatEntryTime(entry.startAt, entry.startTimezone, timezone)}
          </span>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
            {t('map')}
          </a>
        )}
      </div>
    );
  }

  return (
    <main className="page">
      <h2 style={{ margin: 0 }}>{t('title')}</h2>
      <p className="text-soft">{t('subtitle')}</p>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t('current')}</h3>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('section')}
          </div>
          <div>{currentSection ? currentSection.name : t('noSectionToday')}</div>
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('stay')}
          </div>
          {currentStay ? <EntryRow entry={currentStay} /> : <div className="text-soft">{t('nothingRightNow')}</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('activity')}
          </div>
          {currentActivity ? (
            <EntryRow entry={currentActivity} />
          ) : (
            <div className="text-soft">{t('nothingRightNow')}</div>
          )}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t('next')}</h3>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('nextUp')}
          </div>
          {nextOverall ? <EntryRow entry={nextOverall} /> : <div className="text-soft">{t('nothingLeftOnTrip')}</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('nextTransport')}
          </div>
          {nextTransport ? <EntryRow entry={nextTransport} /> : <div className="text-soft">{t('noneScheduled')}</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('nextActivity')}
          </div>
          {nextActivity ? <EntryRow entry={nextActivity} /> : <div className="text-soft">{t('noneScheduled')}</div>}
        </div>

        <div>
          <div className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            {t('nextStay')}
          </div>
          {nextStay ? <EntryRow entry={nextStay} /> : <div className="text-soft">{t('noneScheduled')}</div>}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t('quickAccess')}</h3>
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href={`/trips/${tripId}/documents`} className="btn btn-outline">
            {t('documents')}
          </Link>
          <Link href={`/trips/${tripId}/important-info`} className="btn btn-outline">
            {t('importantInfo')}
          </Link>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t('todaysFullItinerary')}</h3>
        {todaysEntries.length === 0 ? (
          <div className="empty-state">{t('nothingToday')}</div>
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
