package com.trails.app.ui.entrydetail

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * User-requested redesign: every leg of a Transport entry -- including the
 * first -- is one uniform Flight (lib/entry-types/transport.schema.ts's
 * `flights`, mirrored here), instead of a full-fields first leg plus
 * bare-bones "stopovers" for the rest. A stopover is no longer its own
 * entered object -- it's the computed display of the gap between one
 * Flight's arrival and the next Flight's departure (see
 * [formatStopoverClock]/[formatStopoverDateTime], now applied to a
 * flight's own arrival/next flight's departure rather than a separate
 * stopover object). `departureAt`/`arrivalAt` stay plain
 * `YYYY-MM-DDTHH:mm` strings straight from/to DateTimeField, same as every
 * other unzoned datetime this app already treats as literal digits, never
 * a real instant -- see the web schema's own comment on why.
 */
data class FlightDraft(
    val departureLocation: String = "",
    val departureAt: String = "",
    val departureTimezone: String = "",
    val arrivalLocation: String = "",
    val arrivalAt: String = "",
    val arrivalTimezone: String = "",
    val flightNumber: String = "",
    val terminal: String = "",
    val gate: String = "",
    val platform: String = "",
    val seat: String = "",
)

/**
 * Reads only the `flights` key, as its own typed `JsonArray` -- never
 * touches/depends on Transport's other flat typeDetails keys
 * (`baggageInfo`, the only one left), which are parsed separately via
 * [parseFlatTypeDetails].
 */
fun parseFlights(typeDetailsJson: String?): List<FlightDraft> {
    if (typeDetailsJson.isNullOrBlank()) return emptyList()
    return runCatching {
        val root = Json.parseToJsonElement(typeDetailsJson).jsonObject
        val flights = root["flights"] as? JsonArray ?: return emptyList()
        flights.map { element ->
            val obj = element.jsonObject
            fun field(key: String) = (obj[key] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content.orEmpty()
            FlightDraft(
                departureLocation = field("departureLocation"),
                departureAt = field("departureAt"),
                departureTimezone = field("departureTimezone"),
                arrivalLocation = field("arrivalLocation"),
                arrivalAt = field("arrivalAt"),
                arrivalTimezone = field("arrivalTimezone"),
                flightNumber = field("flightNumber"),
                terminal = field("terminal"),
                gate = field("gate"),
                platform = field("platform"),
                seat = field("seat"),
            )
        }
    }.getOrDefault(emptyList())
}

/** Inverse of [parseFlights] -- builds the `flights` JsonArray for the outgoing typeDetails JsonObject. */
fun flightsToJsonArray(flights: List<FlightDraft>): JsonArray = JsonArray(
    flights.map { f ->
        fun value(v: String) = v.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull
        JsonObject(
            mapOf(
                "departureLocation" to value(f.departureLocation),
                "departureAt" to JsonPrimitive(f.departureAt),
                "departureTimezone" to value(f.departureTimezone),
                "arrivalLocation" to value(f.arrivalLocation),
                "arrivalAt" to JsonPrimitive(f.arrivalAt),
                "arrivalTimezone" to value(f.arrivalTimezone),
                "flightNumber" to value(f.flightNumber),
                "terminal" to value(f.terminal),
                "gate" to value(f.gate),
                "platform" to value(f.platform),
                "seat" to value(f.seat),
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
 * Bug fix (prerequisite for the Flights redesign, not optional): parses
 * every flat (primitive-valued) key of a TimelineEntry's typeDetails JSON,
 * skipping `flights`-shaped non-primitive entries individually rather than
 * failing the whole object -- `(Json.parseToJsonElement(json) as
 * JsonObject).entries.associate { (k, v) -> k to v.jsonPrimitive.content }`
 * (the previous shape of this logic, once duplicated in both
 * EntryEditViewModel and EntryDetailViewModel) throws the moment any value
 * isn't a JsonPrimitive, which a wrapping `runCatching` then silently
 * turned into `emptyMap()` for the *entire* object -- blanking
 * `baggageInfo` too, the instant any Transport entry had a `flights` array
 * at all.
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

/**
 * Read-only, computed display of the gap between one Flight's arrival and
 * the next Flight's departure -- no longer separately entered data. Plain
 * literal-clock-time comparison (no timezone math): a layover's own
 * arrival and the next leg's departure happen at the same real airport in
 * the overwhelming common case.
 */
fun stopoverGapLabel(prev: FlightDraft, next: FlightDraft): String {
    val location = prev.arrivalLocation.trim().ifEmpty { next.departureLocation.trim() }
    val suffix = if (location.isNotEmpty()) " at $location" else ""
    return "⏱ Stopover$suffix: ${formatStopoverClock(prev.arrivalAt)}–${formatStopoverClock(next.departureAt)}"
}
