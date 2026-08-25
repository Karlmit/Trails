package com.trails.app.ui.entrydetail

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * User-requested: an optional connecting itinerary for a Transport entry
 * (lib/entry-types/transport.schema.ts's `stopovers`, mirrored here). Each
 * stopover is an intermediate landing -- location, this leg's arrival, the
 * *next* leg's departure, and that next leg's own flight number (the first
 * leg's number is the entry's existing top-level `serviceNumber` field,
 * unchanged). `arrivalAt`/`departureAt` stay plain `YYYY-MM-DDTHH:mm`
 * strings straight from/to DateTimeField, same as every other unzoned
 * datetime this app already treats as literal digits, never a real
 * instant -- see the web schema's own comment on why.
 */
data class StopoverDraft(
    val location: String = "",
    val arrivalAt: String = "",
    val departureAt: String = "",
    val flightNumber: String = "",
)

/**
 * Reads only the `stopovers` key, as its own typed `JsonArray` -- never
 * touches/depends on Transport's other flat typeDetails keys (terminal/
 * gate/platform/serviceNumber/seat/baggageInfo), which are parsed
 * separately via `parseTypeDetails`'s own tolerant-of-non-primitives fix.
 */
fun parseStopovers(typeDetailsJson: String?): List<StopoverDraft> {
    if (typeDetailsJson.isNullOrBlank()) return emptyList()
    return runCatching {
        val root = Json.parseToJsonElement(typeDetailsJson).jsonObject
        val stopovers = root["stopovers"] as? JsonArray ?: return emptyList()
        stopovers.map { element ->
            val obj = element.jsonObject
            StopoverDraft(
                location = (obj["location"] as? JsonPrimitive)?.content.orEmpty(),
                arrivalAt = (obj["arrivalAt"] as? JsonPrimitive)?.content.orEmpty(),
                departureAt = (obj["departureAt"] as? JsonPrimitive)?.content.orEmpty(),
                flightNumber = (obj["flightNumber"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content.orEmpty(),
            )
        }
    }.getOrDefault(emptyList())
}

/** Inverse of [parseStopovers] -- builds the `stopovers` JsonArray for the outgoing typeDetails JsonObject. A row whose location is still blank (added, never filled in) is dropped rather than sent. */
fun stopoversToJsonArray(stopovers: List<StopoverDraft>): JsonArray = JsonArray(
    stopovers.filter { it.location.isNotBlank() }.map { s ->
        JsonObject(
            mapOf(
                "location" to JsonPrimitive(s.location.trim()),
                "arrivalAt" to JsonPrimitive(s.arrivalAt),
                "departureAt" to JsonPrimitive(s.departureAt),
                "flightNumber" to (s.flightNumber.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull),
            ),
        )
    },
)

/** Same literal-digits formatting trick as EntryDetailPanel.tsx's web equivalent -- "HH:mm" straight out of the stored string, no Date/timezone involved. */
fun formatStopoverClock(value: String): String {
    val match = Regex("T(\\d{2}):(\\d{2})").find(value)
    return match?.groupValues?.let { "${it[1]}:${it[2]}" } ?: value
}

/**
 * Bug fix (prerequisite for stopovers, not optional): parses every flat
 * (primitive-valued) key of a TimelineEntry's typeDetails JSON, skipping
 * `stopovers`-shaped non-primitive entries individually rather than
 * failing the whole object -- `(Json.parseToJsonElement(json) as
 * JsonObject).entries.associate { (k, v) -> k to v.jsonPrimitive.content }`
 * (the previous shape of this logic, once duplicated in both
 * EntryEditViewModel and EntryDetailViewModel) throws the moment any value
 * isn't a JsonPrimitive, which a wrapping `runCatching` then silently
 * turned into `emptyMap()` for the *entire* object -- blanking
 * terminal/gate/platform/serviceNumber/seat/baggageInfo too, the instant
 * any Transport entry had a `stopovers` array at all.
 */
fun parseFlatTypeDetails(typeDetailsJson: String?): Map<String, String> {
    if (typeDetailsJson.isNullOrBlank()) return emptyMap()
    return runCatching {
        Json.parseToJsonElement(typeDetailsJson).jsonObject.entries
            .mapNotNull { (key, value) -> (value as? JsonPrimitive)?.takeIf { it !is JsonNull }?.let { key to it.content } }
            .toMap()
    }.getOrDefault(emptyMap())
}

/** Same as [formatStopoverClock] but includes the month/day too, for the read-only detail screen. */
fun formatStopoverDateTime(value: String): String {
    val match = Regex("\\d{4}-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})").find(value) ?: return value
    val (month, day, hour, minute) = match.destructured
    val monthNames = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    val monthName = month.toIntOrNull()?.let { monthNames.getOrNull(it - 1) } ?: month
    return "$monthName ${day.toIntOrNull() ?: day}, $hour:$minute"
}
