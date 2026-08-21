package com.trails.app.ui.timeline.graph

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

data class DayLabel(val monthDay: String, val weekday: String)

fun formatDayLabel(dateKey: String): DayLabel = runCatching {
    val date = java.time.LocalDate.parse(dateKey)
    val month = date.month.getDisplayName(TextStyle.SHORT, Locale.getDefault())
    DayLabel("$month ${date.dayOfMonth}", date.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault()))
}.getOrDefault(DayLabel(dateKey, ""))

data class DayLineLabel(val text: String, val showSubtype: Boolean)

/** lib/(web)/trips/[tripId]/timeline/page.tsx::dayLineLabel */
fun dayLineLabel(line: TimelineDayLine, tripTimezone: String): DayLineLabel {
    val isTimedType = line.entryType == "TRANSPORT" || line.entryType == "STAY"
    if (!isTimedType) return DayLineLabel(line.title, showSubtype = true)

    if (line.isStart) {
        val word = if (line.entryType == "TRANSPORT") "Departure" else "Check-in"
        val (hour, minute) = entryClockTime(line.startAt, line.startTimezone)
        val text = if (hour != 0 || minute != 0) {
            "${line.title} · $word ${formatHHMM(line.startAt, line.startTimezone, tripTimezone)}"
        } else {
            "${line.title} · $word"
        }
        return DayLineLabel(text, showSubtype = false)
    }
    if (line.isEnd && line.endAt != null) {
        val word = if (line.entryType == "TRANSPORT") "Arrival" else "Check-out"
        val (hour, minute) = entryClockTime(line.endAt, line.endTimezone)
        val text = if (hour != 0 || minute != 0) {
            "${line.title} · $word ${formatHHMM(line.endAt, line.endTimezone, tripTimezone)}"
        } else {
            "${line.title} · $word"
        }
        return DayLineLabel(text, showSubtype = false)
    }
    return DayLineLabel(line.title, showSubtype = false)
}
