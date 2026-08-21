package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "timeline_entries", indices = [Index("tripId")])
data class TimelineEntryEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val entryType: String,
    val subtype: String?,
    val title: String,
    val description: String?,
    val startAt: String,
    val endAt: String?,
    val startTimezone: String?,
    val endTimezone: String?,
    val locationName: String?,
    val locationAddress: String?,
    val locationLat: Double?,
    val locationLng: Double?,
    val locationMapLink: String?,
    val bookingReference: String?,
    val website: String?,
    val bookedVia: String?,
    val expenseAmount: Double?,
    val expenseCurrency: String?,
    val expensePaymentStatus: String?,
    val expensePaymentNote: String?,
    val contactName: String?,
    val contactPhone: String?,
    val contactEmail: String?,
    val notes: String?,
    val postTripNotes: String?,
    // AD-1's per-entryType JSON, flattened to a string at this boundary
    // (data/Mappers.kt) -- parsed back to structured data only where a
    // screen actually needs it (Phase 2+).
    val typeDetailsJson: String,
    val publishedAt: String?,
    val isPrivate: Boolean,
    val createdAt: String,
    val updatedAt: String,
)
