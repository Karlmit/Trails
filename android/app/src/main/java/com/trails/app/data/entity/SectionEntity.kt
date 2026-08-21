package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "sections", indices = [Index("tripId")])
data class SectionEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val name: String,
    val startDate: String,
    val endDate: String,
    val color: String?,
    val emoji: String?,
    val createdAt: String,
    val updatedAt: String,
)
