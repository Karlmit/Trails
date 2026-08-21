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
    val locationName: String?,
    val locationAddress: String?,
    val locationLat: Double?,
    val locationLng: Double?,
    val locationMapLink: String?,
    val contactName: String?,
    val contactPhone: String?,
    val contactEmail: String?,
    val isPrivate: Boolean,
    val createdAt: String,
    val updatedAt: String,
)
