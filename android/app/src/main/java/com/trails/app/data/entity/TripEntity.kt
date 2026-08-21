package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "trips")
data class TripEntity(
    @PrimaryKey val id: String,
    val name: String,
    val destination: String?,
    val startDate: String,
    val endDate: String,
    val timezone: String,
    val description: String?,
    val coverImage: String?,
    val visibility: String,
    val status: String,
    val durationDays: Int,
    val createdAt: String,
    val updatedAt: String,
    // Set true once a full TripSyncCoordinator.syncTrip() has completed for
    // this trip -- distinct from just having been listed on the Trips
    // screen (which only ever fetches the shallow Trip row itself, never
    // Sections/Entries/Checklists/files). Drives the "Save offline"
    // affordance on the Trips screen; preserved across every trip-list
    // re-sync (TripRepository.syncTrips()) the same way Attachment/Photo
    // localPath is preserved across their own metadata re-syncs.
    val cachedOffline: Boolean = false,
)
