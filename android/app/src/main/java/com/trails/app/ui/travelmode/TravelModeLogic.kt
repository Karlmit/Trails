package com.trails.app.ui.travelmode

import com.trails.app.data.entity.TimelineEntryEntity
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/** lib/trip-status.ts::tripLocalNow, re-expressed as a comparable Instant sharing the same "literal digits" frame as our stored startAt/endAt strings. */
fun tripLocalNowAsLiteralInstant(now: Instant, timezone: String): Instant {
    val zdt = now.atZone(ZoneId.of(timezone))
    return LocalDateTime.of(zdt.year, zdt.monthValue, zdt.dayOfMonth, zdt.hour, zdt.minute, zdt.second).toInstant(ZoneOffset.UTC)
}

private fun earliestStart(entries: List<TimelineEntryEntity>): TimelineEntryEntity? =
    entries.minByOrNull { Instant.parse(it.startAt) }

/** lib/travel-mode.ts::findCurrentStay */
fun findCurrentStay(entries: List<TimelineEntryEntity>, now: Instant, timezone: String): TimelineEntryEntity? {
    val localNow = tripLocalNowAsLiteralInstant(now, timezone)
    return earliestStart(
        entries.filter {
            it.entryType == "STAY" && it.endAt != null &&
                !Instant.parse(it.startAt).isAfter(localNow) && !localNow.isAfter(Instant.parse(it.endAt))
        },
    )
}

/** lib/travel-mode.ts::findCurrentActivity */
fun findCurrentActivity(entries: List<TimelineEntryEntity>, now: Instant, timezone: String): TimelineEntryEntity? {
    val todayKey = now.atZone(ZoneId.of(timezone)).toLocalDate().toString()
    val localNow = tripLocalNowAsLiteralInstant(now, timezone)
    return earliestStart(
        entries.filter { entry ->
            if (entry.entryType != "ACTIVITY") return@filter false
            val start = Instant.parse(entry.startAt)
            if (start.isAfter(localNow)) return@filter false
            if (entry.endAt != null) return@filter !localNow.isAfter(Instant.parse(entry.endAt))
            entry.startAt.substring(0, 10) == todayKey
        },
    )
}

/** lib/travel-mode.ts::findNextByType */
fun findNextByType(entries: List<TimelineEntryEntity>, now: Instant, timezone: String, entryType: String? = null): TimelineEntryEntity? {
    val localNow = tripLocalNowAsLiteralInstant(now, timezone)
    fun referenceTime(entry: TimelineEntryEntity): Instant = if (entry.startTimezone != null) now else localNow
    return entries
        .filter { (entryType == null || it.entryType == entryType) && Instant.parse(it.startAt).isAfter(referenceTime(it)) }
        .minByOrNull { Instant.parse(it.startAt) }
}

/** lib/travel-mode.ts::mapsSearchUrl / entryMapsUrl */
fun entryMapsUrl(locationAddress: String?, locationName: String?): String? {
    val address = locationAddress?.takeIf { it.isNotBlank() } ?: locationName?.takeIf { it.isNotBlank() } ?: return null
    return "https://www.google.com/maps/search/?api=1&query=${java.net.URLEncoder.encode(address, "UTF-8")}"
}
