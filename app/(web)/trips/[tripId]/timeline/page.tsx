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
  type TimelineBranchSegment,
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

// spec-timeline-git-graph: one lane = LANE_UNIT px, and the SVG viewBox
// width is set to the exact same pixel count (not scaled) -- so an x
// coordinate in the path data always means the same real pixel column,
// letting a plain absolutely-positioned HTML dot (drawn separately, see
// the dots column below) line up with the trunk's own path with no extra
// math. Only the vertical axis stretches (`preserveAspectRatio="none"`,
// viewBox height fixed at 100 "units") to fill whatever height a day's own
// content happens to need.
const LANE_UNIT = 16;
const TRUNK_X = LANE_UNIT / 2;
const laneX = (laneIndex: number) => LANE_UNIT * (laneIndex + 1) + LANE_UNIT / 2;

// User-reported: a single-line "Tue, Dec 1"-style label wrapped onto two
// lines for some dates but not others (whichever combination of weekday/
// month name happened to exceed the date column's fixed width) -- an
// inconsistent, ragged row height depending on which words happened to be
// long that day. Always split into exactly two lines instead -- "Dec 1"
// then "Tuesday" -- so every row's date cell is the same shape regardless
// of which day it is.
function formatDayLabel(dateKey: string): { monthDay: string; weekday: string } {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
  return { monthDay, weekday };
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

// spec-timeline-git-graph: a single-day Entry (isStart and isEnd both true)
// is a dot on the trunk and still gets a real Check-in/Departure time, just
// like the first/last day of a multi-day Entry's branch does; any day
// strictly between a branch's own start/end is just the title, since the
// branch line itself already communicates "still ongoing." Activity/Note
// never show a time at all -- the caller falls back to showing `subtype`
// instead. User-reported: "Check-in/out time should not be mandatory" --
// Stay/Transport can now also have no specific time (DateTimeInput's
// `timeRequired={false}`, EntryForm.tsx), stored as literal midnight; the
// word (Check-in/Departure/etc.) still shows, just without a fabricated
// "00:00" the traveler never actually entered.
function dayLineLabel(line: TimelineDayLine, tripTimezone: string): { text: string; showSubtype: boolean } {
  const isTimedType = line.entryType === 'TRANSPORT' || line.entryType === 'STAY';
  if (!isTimedType) {
    return { text: line.title, showSubtype: true };
  }
  if (line.isStart) {
    const word = line.entryType === 'TRANSPORT' ? 'Departure' : 'Check-in';
    const { hour, minute } = entryEndpointClockTime(line.startAt, line.startTimezone);
    const hasTime = hour !== 0 || minute !== 0;
    const text = hasTime
      ? `${line.title} · ${word} ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}`
      : `${line.title} · ${word}`;
    return { text, showSubtype: false };
  }
  if (line.isEnd && line.endAt) {
    const word = line.entryType === 'TRANSPORT' ? 'Arrival' : 'Check-out';
    const { hour, minute } = entryEndpointClockTime(line.endAt, line.endTimezone);
    const hasTime = hour !== 0 || minute !== 0;
    const text = hasTime
      ? `${line.title} · ${word} ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}`
      : `${line.title} · ${word}`;
    return { text, showSubtype: false };
  }
  return { text: line.title, showSubtype: false };
}

// spec-timeline-git-graph: the path data for one branch segment, in
// viewBox units -- 0..100 vertically regardless of the row's actual
// rendered height (preserveAspectRatio="none" stretches it to fit).
// 'start'/'end' are smooth S-curves between the trunk and this lane
// (a real git graph's own branch/merge shape); 'through' is a plain
// straight line down the lane, parallel to the trunk.
function branchPath(branch: TimelineBranchSegment): string {
  const x = laneX(branch.laneIndex);
  if (branch.position === 'start') return `M ${TRUNK_X} 0 C ${TRUNK_X} 50, ${x} 50, ${x} 100`;
  if (branch.position === 'end') return `M ${x} 0 C ${x} 50, ${TRUNK_X} 50, ${TRUNK_X} 100`;
  return `M ${x} 0 L ${x} 100`;
}

// spec-timeline-git-graph: user-directed redesign, modeled directly on
// GitKraken's own branch/merge graph. User-reported regressions this
// corrects, from the previous (non-git-graph) redesign:
//   - "the decision to remove the lines for travel was a really bad call"
//     / "a bad call to remove lines for stays" -- both Stay and Transport
//     now share one branch mechanism (lib/timeline.ts's
//     TimelineBranchSegment), colored by their own Entry Type
//     (entryTypeColor), never by an ad hoc Stay-only ribbon scheme.
//   - "lines added in between the dates and the info" -- the graph column
//     is leftmost again, before the date column, matching GitKraken's own
//     layout and this app's pre-existing convention.
//   - "lines are still ending abruptly with a flat end" -- a branch's own
//     start/end is a smooth curve peeling off of / merging into the trunk
//     (SVG cubic beziers), not a rectangular bar with rounded corners.
//   - "we use a main line the same color as the section" -- the trunk
//     (lane -1, always drawn) is colored per its own day's Section,
//     dashed/neutral on a gap day; "if a stay or travel is planned this
//     branches out of the main line and then back in" -- exactly what
//     TimelineBranchSegment's 'start'/'through'/'end' positions draw see
//     branchPath above); "one-day activities... different colored dots on
//     the main line" -- a single-day Entry is a dot at the trunk's own x
//     position; "several activities... make that section taller" -- the
//     dots column mirrors the content column's own line-by-line rhythm
//     (same gap, one dot-or-blank slot per line), so a day with N lines
//     naturally needs the same height on both sides, no special-casing.
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
  const { days: laidOutDays, laneCount } = layoutTimelineEntries(days, entriesForLayout);

  const graphWidth = LANE_UNIT * (laneCount + 1);
  const gridTemplateColumns = `${graphWidth}px 84px 1fr`;

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
          const trunkColor = section
            ? (section.color && sectionCustomColorSolid(section.color)) ?? sectionColorSolid(day.sectionIndex!)
            : undefined;
          const previousSectionIndex = index > 0 ? laidOutDays[index - 1].sectionIndex : null;
          const showSectionLabel = section !== null && day.sectionIndex !== previousSectionIndex;
          const rowLine = index + 1;
          const dayLabel = formatDayLabel(day.dateKey);

          return (
            <div key={day.dateKey} className="timeline-grid-row">
              <div
                id={`day-${day.dateKey}`}
                className={`timeline-row-bg${day.isToday ? ' is-today' : ''}`}
                style={{
                  gridRow: rowLine,
                  ...(bandColor ? { ['--band-color' as string]: bandColor } : undefined),
                }}
              />

              <div className="timeline-graph-cell" style={{ gridRow: rowLine, gridColumn: 1, width: graphWidth }}>
                <svg
                  className="timeline-graph-svg"
                  viewBox={`0 0 ${graphWidth} 100`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d={`M ${TRUNK_X} 0 L ${TRUNK_X} 100`}
                    className={`timeline-trunk-path${trunkColor ? '' : ' is-gap'}`}
                    style={trunkColor ? { stroke: trunkColor } : undefined}
                  />
                  {day.branches.map((branch) => (
                    <path
                      key={branch.entryId}
                      d={branchPath(branch)}
                      className="timeline-branch-path"
                      style={{ stroke: entryTypeColor(branch.entryType) }}
                    />
                  ))}
                </svg>
                <div className="timeline-dots-column">
                  {day.lines.map((line) => {
                    const isSingleDay = line.isStart && line.isEnd;
                    return (
                      <div key={line.entryId} className="timeline-dot-slot">
                        {isSingleDay && (
                          <span
                            className="timeline-dot"
                            style={{ ['--dot-color' as string]: entryTypeColor(line.entryType) }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={`timeline-date-cell${day.isToday ? ' is-today' : ''}`}
                style={{ gridRow: rowLine, gridColumn: 2 }}
              >
                <div className="timeline-date-primary">{dayLabel.monthDay}</div>
                <div className="timeline-date-weekday">{dayLabel.weekday}</div>
              </div>

              <div className="timeline-content-cell" style={{ gridRow: rowLine, gridColumn: 3 }}>
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
                      const isBlogPost = line.entryType === 'BLOG_POST';
                      return (
                        <Link
                          key={line.entryId}
                          href={entryDetailHref(tripId, line.entryType, line.entryId)}
                          className={`entry-chip${isBlogPost ? ' entry-chip-blog' : ''}`}
                        >
                          {/* User-reported: "it should be a fancy link to the
                              blog post" -- a Blog Post has no subtype badge
                              of its own (labels.ts), so on the Timeline it
                              rendered as a plain, undistinguished text link,
                              identical to a Note. A book icon + brand-color
                              text + "Read post" affordance sets it apart at
                              a glance. */}
                          {isBlogPost && (
                            <span className="entry-chip-blog-icon" aria-hidden="true">
                              📖
                            </span>
                          )}
                          <span>{text}</span>
                          {showSubtype && line.subtype && (
                            <span className="text-soft"> · {subtypeLabel(line.subtype)}</span>
                          )}
                          {isBlogPost && <span className="entry-chip-blog-cta"> Read post →</span>}
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
      </div>

      {viewer.type === 'user' && (
        <Link href={`/trips/${tripId}/entries/new`} className="fab" aria-label="Add Entry">
          +
        </Link>
      )}
    </main>
  );
}
