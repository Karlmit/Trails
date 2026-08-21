package com.trails.app.network.dto

import kotlinx.serialization.Serializable

// Mirrors lib/serializers.ts::serializeSection.
@Serializable
data class SectionDto(
    val id: String,
    val tripId: String,
    val name: String,
    val startDate: String,
    val endDate: String,
    val color: String? = null,
    val emoji: String? = null,
    val createdAt: String,
    val updatedAt: String,
)
