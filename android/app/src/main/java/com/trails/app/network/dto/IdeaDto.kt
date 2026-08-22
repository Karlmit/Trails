package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class IdeaDto(
    val id: String,
    val tripId: String,
    val sectionId: String? = null,
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
    val createdAt: String,
    val updatedAt: String,
)
