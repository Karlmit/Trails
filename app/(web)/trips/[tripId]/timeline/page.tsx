import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  computeTripStatus,
  dateKeyInTimezone,
  entryEndpointClockTime,
  timeOfDayInTimezone,
  timezoneDisclosure,
} from '@/lib/trip-status';
import {
  buildTimelineDays,
  layoutTimelineEntries,
  type EntryForLayout,
  type StayHandoff,
  type TimelineDayLine,
} from '@/lib/timeline';
import {
  sectionColor,
  sectionColorSolid,
  sectionCustomColorBand,
  sectionCustomColorSolid,
} from '@/lib/section-colors';
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

const DATE_COLUMN_WIDTH = 84;
const RIBBON_COLUMN_WIDTH = 10;

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// An entry's own recorded startAt/endAt is its literal wall-clock digits
// (see dateTimeField's comment) by default -- `zone` null reads them back
// with zero timezone conversion, never the Trip's own declared timezone
// (that's `timeOfDayInTimezone`, used elsewhere on this page only for
// `now`). `zone` non-null is a traveler-declared real timezone for this
// specific leg (Transport-only, e.g. a flight's arrival airport) -- the
// stored value is then a real UTC instant, converted through that zone.
// User-reported: that zone is otherwise invisible, so it's disclosed in
// parens whenever it differs from the Trip's own declared timezone.
function formatHHMM(date: Date, zone: string | null, tripTimezone: string): string {
  const { hour, minute } = entryEndpointClockTime(date, zone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${timezoneDisclosure(zone, tripTimezone)}`;
}

// spec-timeline-visual-redesign: every day an Entry touches gets exactly
// one line, always -- a single-day Entry (isStart and isEnd both true), or
// any day a multi-day Entry spans. Stay/Transport show a real Check-in/
// Check-out or Departure/Arrival time on their first/last day (a domestic
// flight or a day-use hotel booking is "first and last" on the same single
// day, and still gets its time); any day strictly between is just the
// title, since the Stay's own ribbon (drawn separately, see
// app/globals.css) already communicates "still ongoing" for Stay, and a
// multi-day Activity/Note has no such device so its own middle days stay
// plain too, matching the pre-redesign behavior. Activity/Note never show
// a time at all -- the caller falls back to showing `subtype` instead.
function dayLineLabel(line: TimelineDayLine, tripTimezone: string): { text: string; showSubtype: boolean } {
  const isTimedType = line.entryType === 'TRANSPORT' || line.entryType === 'STAY';
  if (!isTimedType) {
    return { text: line.title, showSubtype: true };
  }
  if (line.isStart) {
    const word = line.entryType === 'TRANSPORT' ? 'Departure' : 'Check-in';
    return { text: `${line.title} · ${word} ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}`, showSubtype: false };
  }
  if (line.isEnd && line.endAt) {
    const word = line.entryType === 'TRANSPORT' ? 'Arrival' : 'Check-out';
    return { text: `${line.title} · ${word} ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}`, showSubtype: false };
  }
  return { text: line.title, showSubtype: false };
}

// spec-timeline-visual-redesign: replaces the git-graph-style dot rail +
// offset "lane" pill system entirely. User-reported ("the timeline looks
// very messy... lines end abruptly... travel lines share the same space as
// stay lines"): the previous design ran Sections, Stays, and Transport all
// through one generic colored-band/lane abstraction, so touching entries
// (a Stay's own check-out day and the next Stay's check-in day; a
// Transport's arrival day and whatever else landed there) fought over one
// shared per-day "cell" -- whichever was processed last silently won,
// erasing the other's text entirely (the reported "OZO Phuket checkout"
// and "flight arrival" bugs). Now:
//   - A Section is a plain background tint across the whole row (unchanged)
//     plus its name pill on the first day of its run.
//   - A Stay is the one Entry Type that represents *being somewhere* for a
//     span of days, so it alone gets a continuous "ribbon": one real CSS
//     Grid item spanning `startDayIndex`..`endDayIndex` grid rows (so it's
//     genuinely one continuous shape, not stacked per-day segments faking
//     continuity -- variable row heights are handled natively by the grid,
//     no client JS measurement needed). Two Stays meeting on the same day
//     (one's check-out, the next's check-in) get a small two-tone handoff
//     marker on that shared day instead of forcing one ribbon to "win" it.
//   - Transport/Activity are transitions, not places -- they never get a
//     ribbon or a lane at all, only their own text line(s), so they can
//     never compete with a Stay's ribbon for space.
//   - Every Entry that touches a day gets its own line in that day's
//     `lines` array (lib/timeline.ts) -- a plain list, not a lane-indexed
//     slot, so nothing can be silently overwritten.
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
    startTimezone: entry.startTimezone,
    endTimezone: entry.endTimezone,
  }));
  const { days: laidOutDays, stayRibbons, stayHandoffs, stayLaneCount } = layoutTimelineEntries(days, entriesForLayout);

  const ribbonLaneCount = Math.max(stayLaneCount, 1);
  const gridTemplateColumns = `${DATE_COLUMN_WIDTH}px repeat(${ribbonLaneCount}, ${RIBBON_COLUMN_WIDTH}px) 1fr`;

  const handoffsByDayIndex = new Map<number, StayHandoff>();
  for (const handoff of stayHandoffs) handoffsByDayIndex.set(handoff.dayIndex, handoff);

  const ribbonColorVar = (colorIndex: 0 | 1) => `var(--stay-ribbon-${colorIndex === 0 ? 'a' : 'b'})`;

  return (
    <main className="page">
      {todayKey && <TimelineAutoScroll targetId={`day-${todayKey}`} />}

      {trip.sections.length === 0 && (
        <p className="text-soft" style={{ marginBottom: 'var(--space-3)' }}>
          No Sections yet. <Link href={`/trips/${tripId}/sections`}>Add one</Link> to group this
          Trip&rsquo;s days into named legs.
        </p>
      )}

      <div className="timeline-grid" style={{ gridTemplateColumns }}>
        {laidOutDays.map((day, index) => {
          const section = day.sectionIndex !== null ? trip.sections[day.sectionIndex] : null;
          const bandColor = section
            ? (section.color && sectionCustomColorBand(section.color)) ?? sectionColor(day.sectionIndex!)
            : undefined;
          const railColor = section
            ? (section.color && sectionCustomColorSolid(section.color)) ?? sectionColorSolid(day.sectionIndex!)
            : undefined;
          const previousSectionIndex = index > 0 ? laidOutDays[index - 1].sectionIndex : null;
          const showSectionLabel = section !== null && day.sectionIndex !== previousSectionIndex;
          const rowLine = index + 1;
          const handoff = handoffsByDayIndex.get(index);

          return (
            <div key={day.dateKey} className="timeline-grid-row">
              <div
                id={`day-${day.dateKey}`}
                className={`timeline-row-bg${day.isToday ? ' is-today' : ''}`}
                style={{
                  gridRow: rowLine,
                  ...(bandColor ? { ['--band-color' as string]: bandColor, ['--rail-accent-color' as string]: railColor } : undefined),
                }}
              />

              <div className="timeline-date-cell" style={{ gridRow: rowLine, gridColumn: 1 }}>
                {formatDayLabel(day.dateKey)}
              </div>

              {handoff && (
                <div
                  className="timeline-handoff"
                  style={{
                    gridRow: rowLine,
                    gridColumn: 2 + handoff.laneIndex,
                    ['--handoff-color-a' as string]: ribbonColorVar(handoff.outgoingColorIndex),
                    ['--handoff-color-b' as string]: ribbonColorVar(handoff.incomingColorIndex),
                  }}
                  title="Check-out / Check-in the same day"
                  aria-hidden="true"
                />
              )}

              <div
                className="timeline-content-cell"
                style={{ gridRow: rowLine, gridColumn: 2 + ribbonLaneCount }}
              >
                {showSectionLabel && section && (
                  <div className="timeline-section-label">
                    {section.emoji && (
                      <span className="timeline-section-label-emoji" aria-hidden="true">
                        {section.emoji}
                      </span>
                    )}
                    <span className="timeline-section-label-name">{section.name}</span>
                  </div>
                )}
                {day.isToday && (
                  <div className="timeline-current-marker">
                    Today · {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} (
                    {trip.timezone})
                  </div>
                )}
                {day.lines.length > 0 ? (
                  <div className="entry-dot-list">
                    {day.lines.map((line) => {
                      const { text, showSubtype } = dayLineLabel(line, trip.timezone);
                      return (
                        <Link
                          key={line.entryId}
                          href={entryDetailHref(tripId, line.entryType, line.entryId)}
                          className="entry-chip"
                        >
                          <span
                            className="entry-chip-dot"
                            style={{ ['--dot-color' as string]: entryTypeColor(line.entryType) }}
                          />
                          <span>{text}</span>
                          {showSubtype && line.subtype && (
                            <span className="text-soft">· {subtypeLabel(line.subtype)}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="timeline-day-empty">No entries yet</div>
                )}
              </div>
            </div>
          );
        })}

        {stayRibbons.map((ribbon) => (
          <div
            key={ribbon.entryId}
            className={`timeline-ribbon${ribbon.truncatedForHandoff ? ' is-truncated' : ''}`}
            style={{
              gridRow: `${ribbon.startDayIndex + 1} / ${ribbon.endDayIndex + 2}`,
              gridColumn: 2 + ribbon.laneIndex,
              ['--ribbon-color' as string]: ribbonColorVar(ribbon.colorIndex),
            }}
            title={ribbon.title}
            aria-hidden="true"
          />
        ))}
      </div>

      {viewer.type === 'user' && (
        <Link href={`/trips/${tripId}/entries/new`} className="fab" aria-label="Add Entry">
          +
        </Link>
      )}
    </main>
  );
}
