package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class ImportantInfoDto(
    val id: String,
    val tripId: String,
    val title: String,
    val content: String? = null,
    val locationName: String? = null,
    val locationAddress: String? = null,
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val locationMapLink: String? = null,
    val contactName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val isPrivate: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)
