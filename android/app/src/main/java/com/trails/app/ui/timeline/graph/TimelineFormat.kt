package com.trails.app.ui.timeline.graph

import com.trails.app.ui.entrydetail.formatStopoverClock
import com.trails.app.ui.entrydetail.parseStopovers
import java.time.Instant
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

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
private fun stayEndpointSubtitle(line: TimelineDayLine, tripTimezone: String): String {
    val parts = mutableListOf<String>()
    if (line.isStart) {
        val (hour, minute) = entryClockTime(line.startAt, line.startTimezone)
        parts += if (hour != 0 || minute != 0) {
            "Check-in ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}"
        } else {
            "Check-in"
        }
    }
    if (line.isEnd && line.endAt != null) {
        val (hour, minute) = entryClockTime(line.endAt, line.endTimezone)
        parts += if (hour != 0 || minute != 0) {
            "Check-out ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}"
        } else {
            "Check-out"
        }
    }
    return parts.joinToString(" · ")
}

// User-requested: an optional connecting itinerary -- shown as a
// multi-line subtitle on the departure day only (the arrival day keeps
// its own plain "Title · Arrival HH:MM" line, unchanged). Mirrors
// app/(web)/trips/[tripId]/timeline/page.tsx::transportItinerarySubtitle.
private fun transportItinerarySubtitle(typeDetailsJson: String?): String? {
    val stopovers = parseStopovers(typeDetailsJson)
    if (stopovers.isEmpty()) return null

    val firstFlightNumber = runCatching {
        val root = Json.parseToJsonElement(typeDetailsJson!!).jsonObject
        (root["serviceNumber"] as? JsonPrimitive)?.content
    }.getOrNull()

    val lines = mutableListOf(if (!firstFlightNumber.isNullOrBlank()) "✈ $firstFlightNumber" else "✈ Flight 1")
    stopovers.forEachIndexed { index, stopover ->
        lines += "⏱ ${stopover.location} · ${formatStopoverClock(stopover.arrivalAt)}–${formatStopoverClock(stopover.departureAt)}"
        lines += if (stopover.flightNumber.isNotBlank()) "✈ ${stopover.flightNumber}" else "✈ Flight ${index + 2}"
    }
    return lines.joinToString("\n")
}

/** lib/(web)/trips/[tripId]/timeline/page.tsx::dayLineLabel */
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
        if (line.isStart) {
            val (hour, minute) = entryClockTime(line.startAt, line.startTimezone)
            val title = if (hour != 0 || minute != 0) {
                "${line.title} · Departure ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}"
            } else {
                "${line.title} · Departure"
            }
            return DayLineLabel(hidden = false, title = title, subtitle = transportItinerarySubtitle(line.typeDetailsJson), showSubtype = false)
        }
        if (line.isEnd && line.endAt != null) {
            val (hour, minute) = entryClockTime(line.endAt, line.endTimezone)
            val title = if (hour != 0 || minute != 0) {
                "${line.title} · Arrival ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}"
            } else {
                "${line.title} · Arrival"
            }
            return DayLineLabel(hidden = false, title = title, subtitle = null, showSubtype = false)
        }
        return DayLineLabel(hidden = false, title = line.title, subtitle = null, showSubtype = false)
    }
    return DayLineLabel(hidden = false, title = line.title, subtitle = null, showSubtype = true)
}
