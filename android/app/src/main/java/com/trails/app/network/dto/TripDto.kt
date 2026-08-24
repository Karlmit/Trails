package com.trails.app.network.dto

import kotlinx.serialization.Serializable

// Mirrors lib/serializers.ts::serializeTrip in /workspace/trails -- dates are
// kept as the server's raw ISO/YYYY-MM-DD strings rather than parsed here;
// screens that need real Date/Instant math parse them at the point of use.
@Serializable
data class TripDto(
    val id: String,
    val name: String,
    val destination: String? = null,
    val startDate: String,
    val endDate: String,
    val timezone: String,
    val description: String? = null,
    val coverImage: String? = null,
    val visibility: String,
    val pinnedActive: Boolean = false,
    val status: String,
    val durationDays: Int,
    val createdAt: String,
    val updatedAt: String,
)
