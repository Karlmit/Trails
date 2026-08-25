package com.trails.app.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Request bodies for create calls, plus PATCH bodies for the resources
// that still need a fixed request shape (Checklist, Section, Trip, Blog
// Post). Most resources' PATCH schema is a `.strict()` `.partial()` of the
// create shape that does NOT declare `tripId` as a key at all
// (Checklist/Idea/ImportantInfo) -- sending it on an update 400s, since a
// strict schema rejects an unrecognized key regardless of that key's
// value. Checklist gets a dedicated `ChecklistUpdateRequest` without it.
// Section's update schema is a plain (non-strict) `z.object`, which
// silently strips unknown keys instead of rejecting them, so it's safe to
// reuse the create shape there. TimelineEntry/Idea/ImportantInfo's actual
// edit-screen PATCH calls instead build a partial `JsonObject` body
// directly (see PartialPatch.kt's `diffFields`) so an update only ever
// sends the fields the user actually changed -- sending every field
// unconditionally let a stale value silently clobber a concurrent edit
// from another user (user-reported: "Changes users make are not syncing
// correctly"). TimelineEntry is its own case beyond that -- see the
// comment above its request classes below.

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
    val pinnedActive: Boolean = false,
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
data class ChecklistRequest(
    val tripId: String,
    val title: String,
    val emoji: String? = null,
    val isPrivate: Boolean = false,
)

// checklistUpdateSchema (lib/validation.ts) is `.strict()` and has no
// `tripId` key -- PATCH must never send it, or the whole request 400s.
// (ChecklistItem has no PATCH-by-full-body path at all, only the checked-
// toggle's own ChecklistItemPatchRequest, so it needs no Update twin here.)
@Serializable
data class ChecklistUpdateRequest(val title: String, val emoji: String? = null, val isPrivate: Boolean = false)

@Serializable
data class ChecklistItemRequest(val checklistId: String, val text: String, val note: String? = null)

@Serializable
data class ImportantInfoRequest(
    val tripId: String,
    val title: String,
    val content: String? = null,
    val emoji: String? = null,
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
    val sectionId: String? = null,
    val title: String,
    val category: String? = null,
    val description: String? = null,
    val priority: String,
    val weatherSuitability: String,
    val locationName: String? = null,
    val locationAddress: String? = null,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationMapLink: String? = null,
    val estimatedExpenseAmount: Double? = null,
    val estimatedExpenseCurrency: String? = null,
)

// TimelineEntry's per-entryType Zod schemas (lib/entry-types/*.schema.ts) are
// each `.strict()` over a DIFFERENT field set -- Note has no Location/
// Expense/booking fields at all, Stay/Activity have no startTimezone/
// endTimezone, only Transport does. A single universal request class that
// sends every field as an explicit `null` for whatever doesn't apply 400s,
// because a strict schema rejects a key it doesn't declare regardless of
// that key's value. Hence one request class per entryType, each declaring
// only the keys its own schema actually has. `tripId`/`entryType` ARE safe
// to include on both create AND update here (unlike Checklist/Idea/
// ImportantInfo) -- app/api/v1/timeline-entries/[entryId]/route.ts's PATCH
// handler explicitly destructures both out of the body before validating,
// so sending them on a PATCH is silently harmless, not rejected.

@Serializable
data class NoteEntryRequest(
    val tripId: String,
    val entryType: String = "NOTE",
    val title: String,
    val description: String? = null,
    val startAt: String,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val notes: String? = null,
    val postTripNotes: String? = null,
    val isPrivate: Boolean = false,
)

@Serializable
data class StayEntryRequest(
    val tripId: String,
    val entryType: String = "STAY",
    val subtype: String,
    val title: String,
    val description: String? = null,
    val startAt: String,
    val endAt: String,
    val locationName: String,
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
    val isPrivate: Boolean = false,
    val typeDetails: Map<String, String> = emptyMap(),
)

@Serializable
data class TransportEntryRequest(
    val tripId: String,
    val entryType: String = "TRANSPORT",
    val subtype: String,
    val title: String,
    val description: String? = null,
    val startAt: String,
    val endAt: String,
    val startTimezone: String? = null,
    val endTimezone: String? = null,
    val locationName: String,
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
    val isPrivate: Boolean = false,
    // User-requested: every leg of the journey is its own Flight, needing
    // a nested JsonArray value -- unlike Stay/Activity's own typeDetails
    // below, which stay flat Map<String, String> since neither needs
    // anything richer.
    val typeDetails: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class ActivityEntryRequest(
    val tripId: String,
    val entryType: String = "ACTIVITY",
    val subtype: String,
    val title: String,
    val description: String? = null,
    val startAt: String,
    val endAt: String? = null,
    val locationName: String,
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
    val isPrivate: Boolean = false,
    val typeDetails: Map<String, String> = emptyMap(),
)

/** One entrypoint for TimelineRepository's create/update calls -- wraps whichever of the 4 typed bodies above applies. */
sealed class TimelineEntryWriteRequest {
    data class Note(val body: NoteEntryRequest) : TimelineEntryWriteRequest()
    data class Stay(val body: StayEntryRequest) : TimelineEntryWriteRequest()
    data class Transport(val body: TransportEntryRequest) : TimelineEntryWriteRequest()
    data class Activity(val body: ActivityEntryRequest) : TimelineEntryWriteRequest()
}

@Serializable
data class BlogPostRequest(
    val tripId: String,
    val entryType: String = "BLOG_POST",
    val title: String,
    val description: String? = null,
    val startAt: String,
    val isPrivate: Boolean = false,
)

// User-requested manual reordering -- app/api/v1/important-info/[itemId]/move/route.ts.
@Serializable
data class MoveDirectionRequest(val direction: String)

@Serializable
data class LinkRequest(val ownerType: String, val ownerId: String, val url: String, val label: String? = null)

@Serializable
data class TagRequest(val ownerType: String, val ownerId: String, val text: String)
