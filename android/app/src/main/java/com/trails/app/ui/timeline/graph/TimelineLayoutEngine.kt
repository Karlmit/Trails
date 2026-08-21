package com.trails.app.ui.timeline.graph

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * A straight Kotlin port of /workspace/trails/lib/timeline.ts --
 * buildTimelineDays + layoutTimelineEntries -- the exact algorithm behind
 * the web app's GitKraken-style branch/merge graph, so this app draws the
 * same shape from the same data rather than reinventing a different layout.
 */

data class SectionRange(val id: String, val startDateKey: String, val endDateKey: String)

data class EntryForLayout(
    val id: String,
    val entryType: String,
    val subtype: String?,
    val title: String,
    val startAt: String, // ISO-8601, literal-digits UTC unless startTimezone is set
    val endAt: String?,
    val startTimezone: String?,
    val endTimezone: String?,
)

data class TimelineDay(val dateKey: String, val sectionIndex: Int?, val isToday: Boolean)

data class TimelineDayLine(
    val entryId: String,
    val entryType: String,
    val subtype: String?,
    val title: String,
    val isStart: Boolean,
    val isEnd: Boolean,
    val startAt: String,
    val endAt: String?,
    val startTimezone: String?,
    val endTimezone: String?,
)

data class TimelineBranchSegment(
    val entryId: String,
    val entryType: String,
    val laneIndex: Int,
    val position: BranchPosition,
)

enum class BranchPosition { START, THROUGH, END }

data class TimelineDayWithEntries(
    val day: TimelineDay,
    val lines: List<TimelineDayLine>,
    val branches: List<TimelineBranchSegment>,
)

data class TimelineLayout(val days: List<TimelineDayWithEntries>, val laneCount: Int)

/** lib/trip-status.ts::entryEndpointDateKey -- zone null reads the literal digits; set, a real UTC instant converted through that zone. */
fun entryEndpointDateKey(isoDateTime: String, zone: String?): String {
    if (zone == null) return isoDateTime.substring(0, 10)
    return runCatching {
        Instant.parse(isoDateTime).atZone(ZoneId.of(zone)).toLocalDate().toString()
    }.getOrDefault(isoDateTime.substring(0, 10))
}

/** lib/timeline.ts::sectionIndexForDateKey */
fun sectionIndexForDateKey(dateKey: String, sections: List<SectionRange>): Int? {
    val index = sections.indexOfFirst { dateKey >= it.startDateKey && dateKey <= it.endDateKey }
    return if (index == -1) null else index
}

/** lib/timeline.ts::buildTimelineDays */
fun buildTimelineDays(
    tripStartDateKey: String,
    tripEndDateKey: String,
    sections: List<SectionRange>,
    todayKey: String?,
): List<TimelineDay> {
    val days = mutableListOf<TimelineDay>()
    var cursor = LocalDate.parse(tripStartDateKey)
    val end = LocalDate.parse(tripEndDateKey)
    while (!cursor.isAfter(end)) {
        val dateKey = cursor.toString()
        days.add(TimelineDay(dateKey, sectionIndexForDateKey(dateKey, sections), dateKey == todayKey))
        cursor = cursor.plusDays(1)
    }
    return days
}

/** lib/timeline.ts::layoutTimelineEntries */
fun layoutTimelineEntries(days: List<TimelineDay>, entries: List<EntryForLayout>): TimelineLayout {
    val lines = Array(days.size) { mutableListOf<TimelineDayLine>() }
    val branches = Array(days.size) { mutableListOf<TimelineBranchSegment>() }

    val sorted = entries.sortedBy { it.startAt }
    data class LaneOccupant(val entryId: String, val endDayIndex: Int)
    val laneOccupants = mutableListOf<LaneOccupant?>()

    for (entry in sorted) {
        val startKey = entryEndpointDateKey(entry.startAt, entry.startTimezone)
        val endKey = entry.endAt?.let { entryEndpointDateKey(it, entry.endTimezone) } ?: startKey

        val firstIndex = days.indexOfFirst { it.dateKey >= startKey }
        if (firstIndex == -1) continue

        var lastIndex = -1
        for (i in days.indices.reversed()) {
            if (days[i].dateKey <= endKey) {
                lastIndex = i
                break
            }
        }
        if (lastIndex == -1 || firstIndex > lastIndex) continue

        for (i in firstIndex..lastIndex) {
            lines[i].add(
                TimelineDayLine(
                    entryId = entry.id,
                    entryType = entry.entryType,
                    subtype = entry.subtype,
                    title = entry.title,
                    isStart = i == firstIndex,
                    isEnd = i == lastIndex,
                    startAt = entry.startAt,
                    endAt = entry.endAt,
                    startTimezone = entry.startTimezone,
                    endTimezone = entry.endTimezone,
                ),
            )
        }

        if (lastIndex == firstIndex) continue // single-day -- a dot on the trunk, no branch/lane

        var lane = laneOccupants.indexOfFirst { it == null || it.endDayIndex <= firstIndex }
        if (lane == -1) {
            lane = laneOccupants.size
            laneOccupants.add(null)
        }
        laneOccupants[lane] = LaneOccupant(entry.id, lastIndex)

        for (i in firstIndex..lastIndex) {
            val position = when {
                i == firstIndex -> BranchPosition.START
                i == lastIndex -> BranchPosition.END
                else -> BranchPosition.THROUGH
            }
            branches[i].add(TimelineBranchSegment(entry.id, entry.entryType, lane, position))
        }
    }

    val resultDays = days.mapIndexed { i, day -> TimelineDayWithEntries(day, lines[i], branches[i]) }
    return TimelineLayout(resultDays, laneOccupants.size)
}
