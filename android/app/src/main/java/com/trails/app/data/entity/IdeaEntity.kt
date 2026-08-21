package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "ideas", indices = [Index("tripId")])
data class IdeaEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val title: String,
    val category: String?,
    val priority: String,
    val weatherSuitability: String,
    // Stored as a comma-joined string -- Idea.weatherTags is a small,
    // free-form array with no querying need of its own (unlike typeDetails,
    // which at least has a JSON-parse call site); a TypeConverter would be
    // overkill for "split on a delimiter that these tags never contain."
    // Use IdeaEntity.weatherTags (data/Mappers.kt) to read it back as a list.
    val weatherTagsCsv: String,
    val locationName: String?,
    val locationAddress: String?,
    val locationLat: Double?,
    val locationLng: Double?,
    val locationMapLink: String?,
    val estimatedExpenseAmount: Double?,
    val estimatedExpenseCurrency: String?,
    val createdAt: String,
    val updatedAt: String,
)
