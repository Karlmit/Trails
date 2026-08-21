package com.trails.app.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Mirrors lib/serializers.ts::serializeTimelineEntry (AD-1's one discriminated
// table -- unused fields for a given entryType are simply null, same as the
// server response). `typeDetails` is kept as a raw JsonObject here and
// flattened to a JSON string only at the Room-entity boundary
// (data/Mappers.kt) -- Phase 2 screens parse it back per entryType as needed.
@Serializable
data class TimelineEntryDto(
    val id: String,
    val tripId: String,
    val entryType: String,
    val subtype: String? = null,
    val title: String,
    val description: String? = null,
    val startAt: String,
    val endAt: String? = null,
    val startTimezone: String? = null,
    val endTimezone: String? = null,
    val locationName: String? = null,
    val locationAddress: String? = null,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationMapLink: String? = null,
    val bookingReference: String? = null,
    val website: String? = null,
    val bookedVia: String? = null,
    val expenseAmount: Double? = null,
    val expenseCurrency: String? = null,
    val expensePaymentStatus: String? = null,
    val expensePaymentNote: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val notes: String? = null,
    val postTripNotes: String? = null,
    val typeDetails: JsonObject = JsonObject(emptyMap()),
    val publishedAt: String? = null,
    val isPrivate: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)
