package com.trails.app.ui.timeline.graph

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.trails.app.R
import com.trails.app.ui.entrydetail.formatStopoverClock
import com.trails.app.ui.entrydetail.parseFlights
import java.time.Instant
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

/** lib/trip-status.ts::entryEndpointClockTime -- zone null reads literal wall-clock digits, no conversion. */
fun entryClockTime(isoDateTime: String, zone: String?): Pair<Int, Int> {
    if (zone == null) {
        return runCatching {
            isoDateTime.substring(11, 13).toInt() to isoDateTime.substring(14, 16).toInt()
        }.getOrDefault(0 to 0)
    }
    return runCatching {
        val zdt = Instant.parse(isoDateTime).atZone(ZoneId.of(zone))
        zdt.hour to zdt.minute
    }.getOrDefault(0 to 0)
}

/** lib/trip-status.ts::timezoneDisclosure */
fun timezoneDisclosure(zone: String?, tripTimezone: String): String =
    if (zone != null && zone != tripTimezone) " ($zone)" else ""

fun formatHHMM(isoDateTime: String, zone: String?, tripTimezone: String): String {
    val (hour, minute) = entryClockTime(isoDateTime, zone)
    return "%02d:%02d%s".format(hour, minute, timezoneDisclosure(zone, tripTimezone))
}

/** True when an Entry's own recorded time is exactly midnight -- the sentinel a "no specific time" Entry (EntryEditScreen's timeRequired=false) is stored with. Mirrors components/EntryDetailPanel.tsx::hasNoSpecificTime. */
fun hasNoSpecificTime(isoDateTime: String, zone: String?): Boolean {
    val (hour, minute) = entryClockTime(isoDateTime, zone)
    return hour == 0 && minute == 0
}

/** lib/trip-status.ts::formatEntryEndpointDateOnly -- date only, no clock time, locale-aware (Locale.getDefault() follows the in-app language, same as formatDayLabel above). */
fun formatEntryEndpointDateOnly(isoDateTime: String, zone: String?): String = runCatching {
    val date = if (zone == null) {
        java.time.LocalDate.parse(isoDateTime.take(10))
    } else {
        Instant.parse(isoDateTime).atZone(ZoneId.of(zone)).toLocalDate()
    }
    val month = date.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    "$month ${date.dayOfMonth}, ${date.year}"
}.getOrDefault(isoDateTime)

/** lib/trip-status.ts::formatEntryEndpointDateTime -- date + clock time, locale-aware, no timezone-disclosure suffix (unlike formatHHMM -- callers with no Trip timezone in scope, e.g. EntryDetailScreen, use this directly). */
fun formatEntryEndpointDateTime(isoDateTime: String, zone: String?): String {
    val (hour, minute) = entryClockTime(isoDateTime, zone)
    return "${formatEntryEndpointDateOnly(isoDateTime, zone)}, %02d:%02d".format(hour, minute)
}

/** Combines the two above exactly like components/EntryDetailPanel.tsx's own startAt/endAt rendering: date-only when the recorded time is the "no specific time" midnight sentinel, date+time otherwise. */
fun formatEntryEndpoint(isoDateTime: String, zone: String?): String =
    if (hasNoSpecificTime(isoDateTime, zone)) formatEntryEndpointDateOnly(isoDateTime, zone) else formatEntryEndpointDateTime(isoDateTime, zone)

data class DayLabel(val monthDay: String, val weekday: String)

fun formatDayLabel(dateKey: String): DayLabel = runCatching {
    val date = java.time.LocalDate.parse(dateKey)
    val month = date.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    DayLabel("$month ${date.dayOfMonth}", date.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault()))
}.getOrDefault(DayLabel(dateKey, ""))

data class DayLineLabel(val hidden: Boolean, val title: String, val subtitle: String?, val showSubtype: Boolean)

// User-requested: a multi-day Stay's name repeated on every day it spans was
// noise -- the branch line itself already shows it's ongoing, so a Stay is
// now only visible on its check-in/check-out days, each with its own time
// as a subtitle below the name (rather than folded into one inline string
// the way Transport's Departure/Arrival still is).
@Composable
private fun stayEndpointSubtitle(line: TimelineDayLine, tripTimezone: String): String {
    val parts = mutableListOf<String>()
    if (line.isStart) {
        val (hour, minute) = entryClockTime(line.startAt, line.startTimezone)
        parts += if (hour != 0 || minute != 0) {
            stringResource(R.string.timeline_check_in_at, formatHHMM(line.startAt, line.startTimezone, tripTimezone))
        } else {
            stringResource(R.string.timeline_check_in)
        }
    }
    if (line.isEnd && line.endAt != null) {
        val (hour, minute) = entryClockTime(line.endAt, line.endTimezone)
        parts += if (hour != 0 || minute != 0) {
            stringResource(R.string.timeline_check_out_at, formatHHMM(line.endAt, line.endTimezone, tripTimezone))
        } else {
            stringResource(R.string.timeline_check_out)
        }
    }
    return parts.joinToString(" · ")
}

// User-requested: the layover's own line shows only the airport and the
// computed duration now (the two clock times it used to show move onto
// the bordering flights' own lines instead -- see transportItinerarySubtitle).
// Same naive literal-digit diff already used elsewhere for this pair (a
// layover's arrival and the next departure happen at the same real
// airport in the overwhelming common case, so no real timezone
// conversion is needed to get a correct duration).
private fun formatLayoverDuration(arrivalAt: String, departureAt: String): String? {
    val arrival = runCatching { java.time.LocalDateTime.parse(arrivalAt.removeSuffix("Z").take(16)) }.getOrNull()
    val departure = runCatching { java.time.LocalDateTime.parse(departureAt.removeSuffix("Z").take(16)) }.getOrNull()
    if (arrival == null || departure == null) return null
    val totalMinutes = java.time.Duration.between(arrival, departure).toMinutes()
    if (totalMinutes < 0) return null
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return when {
        hours == 0L -> "${minutes}m"
        minutes == 0L -> "${hours}h"
        else -> "${hours}h ${minutes}m"
    }
}

// User-reported: the flight-number/airport text and its clock time or
// layover duration must sit right next to each other, not spread apart to
// the far right of the whole row -- plain inline text, same single-string-
// per-line shape every other subtitle already uses. Mirrors
// app/(web)/trips/[tripId]/timeline/page.tsx::transportItinerarySubtitle.
@Composable
private fun transportItinerarySubtitle(typeDetailsJson: String?): String? {
    val flights = parseFlights(typeDetailsJson)
    // A single Flight is today's exact plain behavior -- no breakdown needed.
    if (flights.size <= 1) return null

    val lines = mutableListOf<String>()
    flights.forEachIndexed { index, flight ->
        if (index > 0) {
            val prev = flights[index - 1]
            val location = prev.arrivalLocation.ifBlank { flight.departureLocation }
            val duration = formatLayoverDuration(prev.arrivalAt, flight.departureAt)
            lines += "⏱ $location${duration?.let { " $it" } ?: ""}"
        }
        // A flight bordering a layover shows whichever of its own Arrival
        // (the layover right after it) or Departure (the layover right
        // before it) clock time that layover needs -- both, for the rare
        // flight with a layover on each side.
        val times = mutableListOf<String>()
        if (index > 0) times += stringResource(R.string.timeline_departure_colon, formatStopoverClock(flight.departureAt))
        if (index < flights.size - 1) times += stringResource(R.string.timeline_arrival_colon, formatStopoverClock(flight.arrivalAt))
        val flightLabel = if (flight.flightNumber.isNotBlank()) {
            "✈ ${flight.flightNumber}"
        } else {
            "✈ " + stringResource(R.string.timeline_flight_number_fallback, index + 1)
        }
        lines += if (times.isNotEmpty()) "$flightLabel (${times.joinToString(" · ")})" else flightLabel
    }
    return lines.joinToString("\n")
}

/** lib/(web)/trips/[tripId]/timeline/page.tsx::dayLineLabel */
@Composable
fun dayLineLabel(line: TimelineDayLine, tripTimezone: String): DayLineLabel {
    if (line.entryType == "STAY") {
        if (!line.isStart && !line.isEnd) {
            return DayLineLabel(hidden = true, title = "", subtitle = null, showSubtype = false)
        }
        return DayLineLabel(
            hidden = false,
            title = line.title,
            subtitle = stayEndpointSubtitle(line, tripTimezone),
            showSubtype = false,
        )
    }
    if (line.entryType == "TRANSPORT") {
        // A same-day Transport (departure and arrival both fall on this day
        // line) is both isStart and isEnd at once -- show both endpoints
        // instead of only the departure the two used to early-return on.
        val parts = mutableListOf<String>()
        if (line.isStart) {
            val (hour, minute) = entryClockTime(line.startAt, line.startTimezone)
            parts += if (hour != 0 || minute != 0) {
                stringResource(R.string.timeline_departure_at, formatHHMM(line.startAt, line.startTimezone, tripTimezone))
            } else {
                stringResource(R.string.timeline_departure)
            }
        }
        if (line.isEnd && line.endAt != null) {
            val (hour, minute) = entryClockTime(line.endAt, line.endTimezone)
            parts += if (hour != 0 || minute != 0) {
                stringResource(R.string.timeline_arrival_at, formatHHMM(line.endAt, line.endTimezone, tripTimezone))
            } else {
                stringResource(R.string.timeline_arrival)
            }
        }
        if (parts.isEmpty()) {
            return DayLineLabel(hidden = false, title = line.title, subtitle = null, showSubtype = false)
        }
        return DayLineLabel(
            hidden = false,
            title = "${line.title} · " + parts.joinToString(" · "),
            subtitle = if (line.isStart) transportItinerarySubtitle(line.typeDetailsJson) else null,
            showSubtype = false,
        )
    }
    return DayLineLabel(hidden = false, title = line.title, subtitle = null, showSubtype = true)
}
