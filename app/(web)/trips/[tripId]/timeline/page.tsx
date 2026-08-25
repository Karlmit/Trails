import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
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
function formatDayLabel(dateKey: string, locale: string): { monthDay: string; weekday: string } {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(date);
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
interface DayLineLabel {
  hidden: boolean;
  title: string;
  subtitle: string | null;
  showSubtype: boolean;
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

// User-requested: a multi-day Stay's name repeated on every day it spans
// was noise -- the branch line itself already shows it's ongoing, so a
// Stay is now only visible on its check-in/check-out days, each with its
// own time as a subtitle below the name (rather than folded into one
// inline string the way Transport's Departure/Arrival still is).
function stayEndpointSubtitle(line: TimelineDayLine, tripTimezone: string, t: Translator): string {
  const parts: string[] = [];
  if (line.isStart) {
    const { hour, minute } = entryEndpointClockTime(line.startAt, line.startTimezone);
    const hasTime = hour !== 0 || minute !== 0;
    parts.push(
      hasTime ? `${t('checkIn')} ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}` : t('checkIn'),
    );
  }
  if (line.isEnd && line.endAt) {
    const { hour, minute } = entryEndpointClockTime(line.endAt, line.endTimezone);
    const hasTime = hour !== 0 || minute !== 0;
    parts.push(
      hasTime ? `${t('checkOut')} ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}` : t('checkOut'),
    );
  }
  return parts.join(' · ');
}

// User-requested redesign: every leg -- including the first -- is one
// uniform Flight, shown as a multi-line subtitle on the departure day
// only (the arrival day keeps its own plain "Title · Arrival HH:MM" line,
// unchanged). Deliberately a plain string literal parse, not a real
// Date/zone conversion -- see lib/entry-types/transport.schema.ts's own
// comment on why flight times are never transformed server-side either.
function formatStopoverClock(value: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}

interface FlightForTimeline {
  departureLocation: string | null;
  departureAt: string;
  arrivalLocation: string | null;
  arrivalAt: string;
  flightNumber: string | null;
}

// User-requested: the layover's own line shows only the airport and the
// computed duration now (the two clock times it used to show move onto
// the bordering flights' own lines instead -- see transportItinerarySubtitle).
// Same naive literal-digit diff already used elsewhere for this pair (a
// layover's arrival and the next departure happen at the same real
// airport in the overwhelming common case, so no real timezone
// conversion is needed to get a correct duration).
function formatLayoverDuration(arrivalAt: string, departureAt: string): string | null {
  const diffMs = new Date(departureAt).getTime() - new Date(arrivalAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// User-reported: the flight-number/airport line and its clock time or
// layover duration must sit right next to each other, not spread apart to
// the far right of the whole row (a flex `justify-content: space-between`
// across the entire subtitle's width, tried first, put it right next to
// the far-right Section badge column instead). Plain inline text, same
// single-string-per-line shape every other subtitle already uses.
function transportItinerarySubtitle(typeDetails: unknown, t: Translator): string | null {
  const details = typeDetails as { flights?: unknown } | null | undefined;
  const flights = Array.isArray(details?.flights) ? (details.flights as FlightForTimeline[]) : [];
  // A single Flight is today's exact plain behavior -- no breakdown needed.
  if (flights.length <= 1) return null;

  const lines: string[] = [];
  flights.forEach((flight, index) => {
    if (index > 0) {
      const prev = flights[index - 1];
      const location = prev.arrivalLocation || flight.departureLocation || '';
      const duration = formatLayoverDuration(prev.arrivalAt, flight.departureAt);
      lines.push(`⏱ ${location}${duration ? ` ${duration}` : ''}`);
    }
    // A flight bordering a layover shows whichever of its own Arrival
    // (the layover right after it) or Departure (the layover right
    // before it) clock time that layover needs -- both, for the rare
    // flight with a layover on each side.
    const times: string[] = [];
    if (index > 0) times.push(`${t('departure')}: ${formatStopoverClock(flight.departureAt)}`);
    if (index < flights.length - 1) times.push(`${t('arrival')}: ${formatStopoverClock(flight.arrivalAt)}`);
    const flightLabel = flight.flightNumber
      ? `✈ ${flight.flightNumber}`
      : `✈ ${t('flightNumberFallback', { number: index + 1 })}`;
    lines.push(times.length > 0 ? `${flightLabel} (${times.join(' · ')})` : flightLabel);
  });
  return lines.join('\n');
}

function dayLineLabel(line: TimelineDayLine, tripTimezone: string, t: Translator): DayLineLabel {
  if (line.entryType === 'STAY') {
    if (!line.isStart && !line.isEnd) {
      return { hidden: true, title: '', subtitle: null, showSubtype: false };
    }
    return {
      hidden: false,
      title: line.title,
      subtitle: stayEndpointSubtitle(line, tripTimezone, t),
      showSubtype: false,
    };
  }
  if (line.entryType === 'TRANSPORT') {
    if (line.isStart) {
      const { hour, minute } = entryEndpointClockTime(line.startAt, line.startTimezone);
      const hasTime = hour !== 0 || minute !== 0;
      const title = hasTime
        ? `${line.title} · ${t('departure')} ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}`
        : `${line.title} · ${t('departure')}`;
      return { hidden: false, title, subtitle: transportItinerarySubtitle(line.typeDetails, t), showSubtype: false };
    }
    if (line.isEnd && line.endAt) {
      const { hour, minute } = entryEndpointClockTime(line.endAt, line.endTimezone);
      const hasTime = hour !== 0 || minute !== 0;
      const title = hasTime
        ? `${line.title} · ${t('arrival')} ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}`
        : `${line.title} · ${t('arrival')}`;
      return { hidden: false, title, subtitle: null, showSubtype: false };
    }
    return { hidden: false, title: line.title, subtitle: null, showSubtype: false };
  }
  return { hidden: false, title: line.title, subtitle: null, showSubtype: true };
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

  const t = await getTranslations('tripTimeline');
  const tShared = await getTranslations('shared');
  const locale = await getLocale();

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
    typeDetails: entry.typeDetails,
  }));
  const { days: laidOutDays, laneCount } = layoutTimelineEntries(days, entriesForLayout);

  const graphWidth = LANE_UNIT * (laneCount + 1);
  const gridTemplateColumns = `${graphWidth}px 84px 1fr`;

  return (
    <main className="page">
      {todayKey && <TimelineAutoScroll targetId={`day-${todayKey}`} />}

      {trip.sections.length === 0 && (
        <p className="text-soft" style={{ marginBottom: 'var(--space-3)' }}>
          {t.rich('noSectionsYet', {
            link: (chunks) => <Link href={`/trips/${tripId}/sections`}>{chunks}</Link>,
          })}
        </p>
      )}

      <div className="timeline-grid" style={{ gridTemplateColumns }}>
        {laidOutDays.map((day, index) => {
          const bandColorFor = (sectionIndex: number | null) => {
            const s = sectionIndex !== null ? trip.sections[sectionIndex] : null;
            return s ? (s.color && sectionCustomColorBand(s.color)) ?? sectionColor(sectionIndex!) : undefined;
          };
          const section = day.sectionIndex !== null ? trip.sections[day.sectionIndex] : null;
          const bandColor = bandColorFor(day.sectionIndex);
          const trunkColor = section
            ? (section.color && sectionCustomColorSolid(section.color)) ?? sectionColorSolid(day.sectionIndex!)
            : undefined;
          const previousSectionIndex = index > 0 ? laidOutDays[index - 1].sectionIndex : null;
          const showSectionLabel = section !== null && day.sectionIndex !== previousSectionIndex;
          // User-requested: the day a Section ends and the next begins
          // reads as an abrupt hard cut between two solid-colored rows --
          // splitting this one day's own band half-and-half (this
          // Section's color on top, the next Section's on the bottom)
          // marks the handoff without needing a day that belongs to both.
          const nextSectionIndex = index < laidOutDays.length - 1 ? laidOutDays[index + 1].sectionIndex : null;
          const isSectionTransition =
            day.sectionIndex !== null && nextSectionIndex !== null && nextSectionIndex !== day.sectionIndex;
          const nextBandColor = isSectionTransition ? bandColorFor(nextSectionIndex) : undefined;
          const rowLine = index + 1;
          const dayLabel = formatDayLabel(day.dateKey, locale);

          return (
            <div key={day.dateKey} className="timeline-grid-row">
              <div
                id={`day-${day.dateKey}`}
                className={`timeline-row-bg${day.isToday ? ' is-today' : ''}${nextBandColor ? ' is-section-transition' : ''}`}
                style={{
                  gridRow: rowLine,
                  ...(bandColor ? { ['--band-color' as string]: bandColor } : undefined),
                  ...(nextBandColor ? { ['--band-color-next' as string]: nextBandColor } : undefined),
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
                    // A Stay's own through-day has no slot at all in the
                    // content column (see entry-dot-list below) -- mirror
                    // that exactly here so every later line's dot still
                    // lines up with its own text line.
                    if (line.entryType === 'STAY' && !line.isStart && !line.isEnd) return null;
                    // A Stay's check-in/check-out line renders two lines of
                    // text (name + time subtitle) in the content column --
                    // this slot must grow to match or every later line's
                    // dot creeps upward relative to its own text.
                    const isTallStayLine = line.entryType === 'STAY' && (line.isStart || line.isEnd);
                    const isSingleDay = line.isStart && line.isEnd;
                    return (
                      <div
                        key={line.entryId}
                        className={`timeline-dot-slot${isTallStayLine ? ' timeline-dot-slot-tall' : ''}`}
                      >
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
                    {t('todayMarker', {
                      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                      timezone: trip.timezone,
                    })}
                  </div>
                )}
                {day.lines.length > 0 ? (
                  <div className="entry-dot-list">
                    {day.lines.map((line) => {
                      const label = dayLineLabel(line, trip.timezone, t);
                      // A Stay's own through-day: the branch line already
                      // shows it's ongoing, so no text at all here.
                      if (label.hidden) return null;
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
                          <span>{label.title}</span>
                          {label.subtitle && (
                            <span className="entry-chip-subtitle text-soft">{label.subtitle}</span>
                          )}
                          {label.showSubtype && line.subtype && (
                            <span className="text-soft"> · {tShared(`entrySubtype.${line.subtype}`)}</span>
                          )}
                          {isBlogPost && <span className="entry-chip-blog-cta"> {t('readPost')}</span>}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="timeline-day-empty">{t('noEntriesYet')}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viewer.type === 'user' && (
        <Link href={`/trips/${tripId}/entries/new`} className="fab" aria-label={t('addEntry')}>
          +
        </Link>
      )}
    </main>
  );
}
