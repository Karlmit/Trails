package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class ChecklistDto(
    val id: String,
    val tripId: String,
    val title: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val items: List<ChecklistItemDto> = emptyList(),
)

@Serializable
data class ChecklistItemDto(
    val id: String,
    val checklistId: String,
    val text: String,
    val checked: Boolean = false,
    val note: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class ChecklistItemPatchRequest(val checked: Boolean)
