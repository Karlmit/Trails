package com.trails.app.ui.timeline.graph

import androidx.compose.ui.graphics.Color
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

// lib/entry-types/labels.ts
private val SUBTYPE_LABELS = mapOf(
    "HOTEL" to "Hotel", "HOSTEL" to "Hostel", "RESORT" to "Resort", "APARTMENT" to "Apartment",
    "VILLA" to "Villa", "GUESTHOUSE" to "Guesthouse", "STAY_OTHER" to "Other",
    "FLIGHT" to "Flight", "TRAIN" to "Train", "FERRY" to "Ferry", "BUS" to "Bus", "CAR" to "Car",
    "TAXI" to "Taxi", "TRANSFER" to "Transfer", "TRANSPORT_OTHER" to "Other",
    "TOUR" to "Tour", "RESTAURANT" to "Restaurant", "ATTRACTION" to "Attraction", "EVENT" to "Event",
    "BEACH" to "Beach", "HIKE" to "Hike", "MUSEUM" to "Museum", "SHOPPING" to "Shopping",
    "NIGHTLIFE" to "Nightlife", "ACTIVITY_OTHER" to "Other",
)

fun subtypeLabel(value: String): String = SUBTYPE_LABELS[value] ?: value

val ENTRY_TYPE_LABELS = mapOf(
    "STAY" to "Stay", "TRANSPORT" to "Transport", "ACTIVITY" to "Activity",
    "NOTE" to "Note", "BLOG_POST" to "Blog Post",
)
