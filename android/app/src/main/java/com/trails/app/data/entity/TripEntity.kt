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
)
