import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, dateKeyInTimezone, timeOfDayInTimezone } from '@/lib/trip-status';
import { buildTimelineDays } from '@/lib/timeline';
import { sectionColor, sectionColorSolid } from '@/lib/section-colors';
import { isUuid } from '@/lib/uuid';
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
// Active Trip. Section add/remove has moved to /trips/[tripId]/sections
// (spec-timeline-ux-and-timezone) -- this page renders, it never mutates.
// No TimelineEntry rows exist yet (deferred); the graph's rail/lane system
// is built generally enough for entry dots/lines to slot in later without
// a rework, but none render here yet.
export default async function TimelinePage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { sections: { orderBy: { startDate: 'asc' } } },
  });
  if (!trip) notFound();

  const now = new Date();
  const status = computeTripStatus(trip, now);
  const todayKey = status === 'ACTIVE' ? dateKeyInTimezone(now, trip.timezone) : null;
  const { hour, minute } = timeOfDayInTimezone(now, trip.timezone);

  const days = buildTimelineDays(trip, trip.sections, todayKey);

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
        {days.map((day) => {
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
                  <div className="timeline-day-empty">No entries yet</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
