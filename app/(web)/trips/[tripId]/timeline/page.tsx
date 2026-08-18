import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, dateKeyInTimezone, timeOfDayInTimezone } from '@/lib/trip-status';
import { buildTimelineDays, layoutTimelineEntries, type EntryForLayout } from '@/lib/timeline';
import { sectionColor, sectionColorSolid } from '@/lib/section-colors';
import { entryTypeColor } from '@/lib/entry-types/colors';
import { subtypeLabel } from '@/lib/entry-types/labels';
import { entryDetailHref, timelineVisibleEntryWhere } from '@/lib/entry-types';
import { isUuid } from '@/lib/uuid';
import { canViewTrip, filterForViewer, getViewer } from '@/lib/viewer';
import Link from 'next/link';
import { TimelineAutoScroll } from '@/components/TimelineAutoScroll';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// FR-6, FR-8, FR-9, FR-10: the Timeline -- a git-graph-style spine (left
// graph column: rail + node per day) plus read-only Section color bands,
// gap days kept visible, auto-scroll + current-position marker for an
// Active Trip. Section add/remove lives on /trips/[tripId]/sections; this
// page renders, it never mutates Sections directly.
//
// spec-timeline-entries: TimelineEntries now render on the same spine
// (lib/timeline.ts's layoutTimelineEntries -- FR-11..FR-15): a single-day
// entry as a dot/chip in the day's content, a multi-day entry as a colored
// pill running down an offset lane between the graph column and the
// Section band, so it never collides with the Section rail. The FAB (the
// one exception to "Timeline is view-only" per DESIGN.md/PRD) launches the
// separate /entries/new create page rather than editing inline here.
export default async function TimelinePage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  // spec-guest-access: one of the five Guest-eligible page shapes -- repeats
  // the layout's own canViewTrip check (defense-in-depth).
  const viewer = await getViewer();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      sections: { orderBy: { startDate: 'asc' } },
      // AD-10: a Draft Blog Post is unconditionally excluded from the
      // Timeline, for every viewer (not just Guests) -- `timelineVisibleEntryWhere()`
      // is the one shared predicate for this, also used by GET
      // /api/v1/timeline-entries, so the two read paths can't drift.
      timelineEntries: {
        where: timelineVisibleEntryWhere(),
        orderBy: { startAt: 'asc' },
      },
    },
  });
  if (!trip || !canViewTrip(trip, viewer)) notFound();

  const now = new Date();
  const status = computeTripStatus(trip, now);
  const todayKey = status === 'ACTIVE' ? dateKeyInTimezone(now, trip.timezone) : null;
  const { hour, minute } = timeOfDayInTimezone(now, trip.timezone);

  const days = buildTimelineDays(trip, trip.sections, todayKey);
  // spec-guest-access: applied AFTER the Prisma query, before
  // layoutTimelineEntries -- a Guest never sees a TimelineEntry marked
  // isPrivate, on top of AD-10's unconditional Draft-Blog-Post exclusion
  // above (a separate, always-applied rule for every viewer).
  const visibleEntries = filterForViewer(trip.timelineEntries, viewer);
  const entriesForLayout: EntryForLayout[] = visibleEntries.map((entry) => ({
    id: entry.id,
    entryType: entry.entryType,
    subtype: entry.subtype,
    title: entry.title,
    startAt: entry.startAt,
    endAt: entry.endAt,
  }));
  const { days: laidOutDays, laneCount } = layoutTimelineEntries(days, entriesForLayout, trip.timezone);

  return (
    <main className="page">
      {todayKey && <TimelineAutoScroll targetId={`day-${todayKey}`} />}

      {trip.sections.length === 0 && (
        <p className="text-soft" style={{ marginBottom: 'var(--space-3)' }}>
          No Sections yet. <Link href={`/trips/${tripId}/sections`}>Add one</Link> to group this
          Trip&rsquo;s days into named legs.
        </p>
      )}

      <div className="stack" style={{ gap: 0 }}>
        {laidOutDays.map((day) => {
          const bandColor = day.sectionIndex !== null ? sectionColor(day.sectionIndex) : undefined;
          const railColor = day.sectionIndex !== null ? sectionColorSolid(day.sectionIndex) : undefined;

          return (
            <div
              key={day.dateKey}
              id={`day-${day.dateKey}`}
              className={`timeline-row${day.isToday ? ' is-today' : ''}`}
            >
              <div className="timeline-graph">
                <div
                  className={`timeline-rail timeline-rail-above${day.connectsAbove ? ' is-connected' : ''}`}
                  style={day.connectsAbove ? { ['--rail-color' as string]: railColor } : undefined}
                />
                <div
                  className="timeline-node"
                  style={!day.isToday && railColor ? { ['--node-color' as string]: railColor } : undefined}
                />
                <div
                  className={`timeline-rail timeline-rail-below${day.connectsBelow ? ' is-connected' : ''}`}
                  style={day.connectsBelow ? { ['--rail-color' as string]: railColor } : undefined}
                />
              </div>

              {laneCount > 0 && (
                <div className="timeline-lanes" style={{ width: laneCount * 12 }}>
                  {day.laneSegments.map((segment, laneIndex) =>
                    segment ? (
                      <Link
                        key={laneIndex}
                        href={entryDetailHref(tripId, segment.entryType, segment.entryId)}
                        className={`timeline-lane-segment${segment.isStart ? ' is-start' : ''}${
                          segment.isEnd ? ' is-end' : ''
                        }`}
                        style={{ ['--segment-color' as string]: entryTypeColor(segment.entryType) }}
                        title={segment.title}
                        aria-label={segment.title}
                      />
                    ) : (
                      <span key={laneIndex} className="timeline-lane-empty" />
                    ),
                  )}
                </div>
              )}

              <div
                className="timeline-content timeline-section-band"
                style={bandColor ? { ['--band-color' as string]: bandColor } : undefined}
              >
                <div className="timeline-day-date">{formatDayLabel(day.dateKey)}</div>
                <div className="stack" style={{ gap: 'var(--space-1)', flex: 1 }}>
                  {day.isToday && (
                    <div className="timeline-current-marker">
                      Today · {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} (
                      {trip.timezone})
                    </div>
                  )}
                  {day.dots.length > 0 ? (
                    <div className="entry-dot-list">
                      {day.dots.map((dot) => (
                        <Link
                          key={dot.id}
                          href={entryDetailHref(tripId, dot.entryType, dot.id)}
                          className="entry-chip"
                        >
                          <span
                            className="entry-chip-dot"
                            style={{ ['--dot-color' as string]: entryTypeColor(dot.entryType) }}
                          />
                          <span>{dot.title}</span>
                          {dot.subtype && <span className="text-soft">· {subtypeLabel(dot.subtype)}</span>}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="timeline-day-empty">No entries yet</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {viewer.type === 'user' && (
        <Link href={`/trips/${tripId}/entries/new`} className="fab" aria-label="Add Entry">
          +
        </Link>
      )}
    </main>
  );
}
