package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "ideas", indices = [Index("tripId"), Index("sectionId")])
data class IdeaEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val sectionId: String?,
    val title: String,
    val category: String?,
    // User-requested optional free text, same shape as
    // ImportantInfoEntity.content -- shown always in the list view, only
    // addable/changeable from the edit screen.
    val description: String? = null,
    val priority: String,
    val weatherSuitability: String,
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
