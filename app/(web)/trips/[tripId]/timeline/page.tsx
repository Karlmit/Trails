import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { computeTripStatus, dateKeyInTimezone, timeOfDayInTimezone } from '@/lib/trip-status';
import { buildTimelineDays } from '@/lib/timeline';
import { sectionColor } from '@/lib/section-colors';
import { serializeSection } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { SectionManager } from '@/components/SectionManager';
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

// FR-6, FR-8, FR-9, FR-10: the Timeline -- Section color bands, gap days
// kept visible, auto-scroll + current-position marker for an Active Trip.
// No TimelineEntry rows exist yet in this spec (deferred); the walking
// skeleton renders the day grid and Section bands only.
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
  const sections = trip.sections.map(serializeSection);

  return (
    <main className="page">
      <SectionManager tripId={tripId} sections={sections} />

      {todayKey && <TimelineAutoScroll targetId={`day-${todayKey}`} />}

      <div className="stack" style={{ gap: 0 }}>
        {days.map((day) => {
          const bandColor = day.sectionIndex !== null ? sectionColor(day.sectionIndex) : undefined;

          return (
            <div
              key={day.dateKey}
              id={`day-${day.dateKey}`}
              className={`timeline-day timeline-section-band${day.isToday ? ' is-today' : ''}`}
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
          );
        })}
      </div>
    </main>
  );
}
