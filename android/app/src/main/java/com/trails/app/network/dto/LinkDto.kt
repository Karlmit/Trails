package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class LinkDto(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val url: String,
    val label: String? = null,
    val createdAt: String,
)

@Serializable
data class TagDto(
    val id: String,
    val ownerType: String,
    val ownerId: String,
    val text: String,
    val createdAt: String,
)
