package com.trails.app.network.dto

import kotlinx.serialization.Serializable

// Request bodies for create/update calls. One shape covers both POST
// (create) and PATCH (update) for each resource -- the server's PATCH
// schemas are a `.partial()` of the create shape and explicitly ignore/
// strip fields they don't own (e.g. tripId/entryType on TimelineEntry), so
// sending the full current state back on every edit (rather than modelling
// "only the changed fields") is simple and safe.

@Serializable
data class TripRequest(
    val name: String,
    val destination: String? = null,
    val startDate: String,
    val endDate: String,
    val timezone: String,
    val description: String? = null,
    val coverImage: String? = null,
    val visibility: String = "PRIVATE",
)

@Serializable
data class SectionRequest(
    val tripId: String,
    val name: String,
    val startDate: String,
    val endDate: String,
    val color: String? = null,
    val emoji: String? = null,
)

@Serializable
data class ChecklistRequest(val tripId: String, val title: String, val description: String? = null)

@Serializable
data class ChecklistItemRequest(val checklistId: String, val text: String, val note: String? = null)

@Serializable
data class ImportantInfoRequest(
    val tripId: String,
    val title: String,
    val content: String? = null,
    val locationName: String? = null,
    val locationAddress: String? = null,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationMapLink: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val isPrivate: Boolean = false,
)

@Serializable
data class IdeaRequest(
    val tripId: String,
    val title: String,
    val category: String? = null,
    val priority: String,
    val weatherSuitability: String,
    val weatherTags: List<String> = emptyList(),
    val locationName: String? = null,
    val locationAddress: String? = null,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationMapLink: String? = null,
    val estimatedExpenseAmount: Double? = null,
    val estimatedExpenseCurrency: String? = null,
)

@Serializable
data class TimelineEntryRequest(
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
    val typeDetails: Map<String, String> = emptyMap(),
    val isPrivate: Boolean = false,
)

@Serializable
data class BlogPostRequest(
    val tripId: String,
    val entryType: String = "BLOG_POST",
    val title: String,
    val description: String? = null,
    val startAt: String,
    val isPrivate: Boolean = false,
)

@Serializable
data class LinkRequest(val ownerType: String, val ownerId: String, val url: String, val label: String? = null)

@Serializable
data class TagRequest(val ownerType: String, val ownerId: String, val text: String)
