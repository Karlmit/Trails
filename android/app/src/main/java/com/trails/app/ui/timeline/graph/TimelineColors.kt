package com.trails.app.ui.timeline.graph

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors

// Ported from lib/section-colors.ts's PALETTE/SOLID_PALETTE (the auto-cycled
// fallback used when Section.color is null) plus SECTION_COLOR_PALETTE (the
// curated set a user can explicitly pick). Band colors carry their own
// alpha; solid colors are the opaque rail/dot counterpart.
private val FALLBACK_BAND = listOf(
    TrailsColors.Brand.copy(alpha = 0.16f),
    TrailsColors.BrandAccent.copy(alpha = 0.14f),
    TrailsColors.BrandUplift.copy(alpha = 0.16f),
    TrailsColors.BrandDeep.copy(alpha = 0.12f),
)
private val FALLBACK_SOLID = listOf(TrailsColors.Brand, TrailsColors.BrandAccent, TrailsColors.BrandUplift, TrailsColors.BrandDeep)

private data class CustomSwatch(val value: String, val solid: Color, val bandAlpha: Float)
private val CUSTOM_SWATCHES = listOf(
    CustomSwatch("#3d6fb4", Color(0xFF3D6FB4), 0.16f),
    CustomSwatch("#5b57a3", Color(0xFF5B57A3), 0.16f),
    CustomSwatch("#8a4f9e", Color(0xFF8A4F9E), 0.16f),
    CustomSwatch("#b3467e", Color(0xFFB3467E), 0.16f),
    CustomSwatch("#c9633f", Color(0xFFC9633F), 0.16f),
    CustomSwatch("#2b8a94", Color(0xFF2B8A94), 0.16f),
    CustomSwatch("#8a6240", Color(0xFF8A6240), 0.16f),
    CustomSwatch("#5f6b75", Color(0xFF5F6B75), 0.16f),
)

/** The exact curated set lib/section-colors.ts's SECTION_COLOR_VALUES allows -- lib/validation.ts rejects anything else on create/update. */
val SECTION_COLOR_OPTIONS: List<String> = CUSTOM_SWATCHES.map { it.value }

fun sectionSwatchColor(value: String): Color = CUSTOM_SWATCHES.find { it.value == value }?.solid ?: Color.Gray

// lib/section-colors.ts's SECTION_EMOJI_OPTIONS -- curated, not free text; lib/validation.ts rejects anything else.
val SECTION_EMOJI_OPTIONS: List<String> = listOf(
    "✈️", "🏖️", "🏔️", "🏙️", "🚗", "🚢", "⛺", "🎉",
    "📍", "🗺️", "🍜", "🥾", "🏛️", "🌴", "❄️", "🏝️",
    "🚆", "🚌", "🛶", "🎿", "🏕️", "🛥️", "🚁", "🧳",
    "🍽️", "🌅", "🎭", "🛍️",
)

fun sectionSolidColor(index: Int, customColor: String?): Color {
    if (customColor != null) {
        CUSTOM_SWATCHES.find { it.value == customColor }?.let { return it.solid }
    }
    return FALLBACK_SOLID[index % FALLBACK_SOLID.size]
}

fun sectionBandColor(index: Int, customColor: String?): Color {
    if (customColor != null) {
        CUSTOM_SWATCHES.find { it.value == customColor }?.let { return it.solid.copy(alpha = it.bandAlpha) }
    }
    return FALLBACK_BAND[index % FALLBACK_BAND.size]
}

// lib/entry-types/colors.ts::entryTypeColor
fun entryTypeColor(entryType: String): Color = when (entryType) {
    "STAY" -> TrailsColors.BrandAccent
    "TRANSPORT" -> TrailsColors.BrandUplift
    "ACTIVITY" -> TrailsColors.Brand
    "BLOG_POST" -> TrailsColors.BrandDeep
    else -> TrailsColors.TextSoft // NOTE
}

// lib/entry-types/icons.ts -- one glyph per Entry Subtype, keyed flat since
// subtype strings are unique across all three enums, plus a per-Entry-Type
// fallback (entryIcon) for the two subtype-less types (Note, Blog Post) and
// the rare Stay/Transport/Activity row with no subtype set.
private val SUBTYPE_ICONS: Map<String, String> = mapOf(
    "HOTEL" to "🏨", "HOSTEL" to "🛏️", "RESORT" to "🏝️", "APARTMENT" to "🏢",
    "VILLA" to "🏡", "GUESTHOUSE" to "🏠", "STAY_OTHER" to "🏘️",
    "FLIGHT" to "✈️", "TRAIN" to "🚆", "FERRY" to "⛴️", "BUS" to "🚌", "CAR" to "🚗",
    "TAXI" to "🚕", "TRANSFER" to "🚐", "TRANSPORT_OTHER" to "🧭",
    "TOUR" to "🗺️", "RESTAURANT" to "🍽️", "ATTRACTION" to "🎡", "EVENT" to "🎉",
    "BEACH" to "🏖️", "HIKE" to "🥾", "MUSEUM" to "🏛️", "SHOPPING" to "🛍️",
    "NIGHTLIFE" to "🍸", "ACTIVITY_OTHER" to "📍",
)

private val ENTRY_TYPE_ICONS: Map<String, String> = mapOf(
    "STAY" to "🏨", "TRANSPORT" to "🚗", "ACTIVITY" to "📍", "NOTE" to "📝", "BLOG_POST" to "📖",
)

fun entryTypeIcon(entryType: String): String = ENTRY_TYPE_ICONS[entryType] ?: "📍"

fun entryIcon(entryType: String, subtype: String?): String =
    subtype?.let { SUBTYPE_ICONS[it] } ?: entryTypeIcon(entryType)

// lib/entry-types/labels.ts, resolved through string resources so every
// screen shows the current app language (see subtypeLabelResolved/
// entryTypeLabelResolved below -- both are @Composable since resolving a
// string resource requires one).
private val SUBTYPE_LABEL_RES: Map<String, Int> = mapOf(
    "HOTEL" to R.string.timeline_subtype_hotel,
    "HOSTEL" to R.string.timeline_subtype_hostel,
    "RESORT" to R.string.timeline_subtype_resort,
    "APARTMENT" to R.string.timeline_subtype_apartment,
    "VILLA" to R.string.timeline_subtype_villa,
    "GUESTHOUSE" to R.string.timeline_subtype_guesthouse,
    "STAY_OTHER" to R.string.timeline_subtype_other,
    "FLIGHT" to R.string.timeline_subtype_flight,
    "TRAIN" to R.string.timeline_subtype_train,
    "FERRY" to R.string.timeline_subtype_ferry,
    "BUS" to R.string.timeline_subtype_bus,
    "CAR" to R.string.timeline_subtype_car,
    "TAXI" to R.string.timeline_subtype_taxi,
    "TRANSFER" to R.string.timeline_subtype_transfer,
    "TRANSPORT_OTHER" to R.string.timeline_subtype_other,
    "TOUR" to R.string.timeline_subtype_tour,
    "RESTAURANT" to R.string.timeline_subtype_restaurant,
    "ATTRACTION" to R.string.timeline_subtype_attraction,
    "EVENT" to R.string.timeline_subtype_event,
    "BEACH" to R.string.timeline_subtype_beach,
    "HIKE" to R.string.timeline_subtype_hike,
    "MUSEUM" to R.string.timeline_subtype_museum,
    "SHOPPING" to R.string.timeline_subtype_shopping,
    "NIGHTLIFE" to R.string.timeline_subtype_nightlife,
    "ACTIVITY_OTHER" to R.string.timeline_subtype_other,
)

@StringRes
private fun subtypeLabelRes(value: String): Int? = SUBTYPE_LABEL_RES[value]

private val ENTRY_TYPE_LABEL_RES: Map<String, Int> = mapOf(
    "STAY" to R.string.timeline_entry_type_stay,
    "TRANSPORT" to R.string.timeline_entry_type_transport,
    "ACTIVITY" to R.string.timeline_entry_type_activity,
    "NOTE" to R.string.timeline_entry_type_note,
    "BLOG_POST" to R.string.timeline_entry_type_blog_post,
)

@Composable
fun subtypeLabelResolved(value: String): String {
    val resId = subtypeLabelRes(value)
    return if (resId != null) stringResource(resId) else value
}

@Composable
fun entryTypeLabelResolved(value: String): String {
    val resId = ENTRY_TYPE_LABEL_RES[value]
    return if (resId != null) stringResource(resId) else value
}
