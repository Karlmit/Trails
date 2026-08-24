package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "important_info", indices = [Index("tripId")])
data class ImportantInfoEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val title: String,
    val content: String?,
    // User-requested: same free-text-via-device-keyboard emoji as
    // ChecklistEntity.emoji -- null falls back to a generic glyph client-side.
    val emoji: String? = null,
    val locationName: String?,
    val locationAddress: String?,
    val locationLat: Double?,
    val locationLng: Double?,
    val locationMapLink: String?,
    val contactName: String?,
    val contactPhone: String?,
    val contactEmail: String?,
    val isPrivate: Boolean,
    // User-requested manual reordering -- server-authoritative, swapped in
    // pairs by the move endpoint; this is just a cache of that value.
    val sortOrder: Int = 0,
    val createdAt: String,
    val updatedAt: String,
)
