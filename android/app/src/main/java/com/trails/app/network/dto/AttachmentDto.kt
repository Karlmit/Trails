package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class AttachmentDto(
    val id: String,
    val tripId: String,
    val ownerType: String,
    val ownerId: String,
    val mimeType: String,
    val sizeBytes: Int,
    val originalFilename: String,
    val createdAt: String,
)

@Serializable
data class PhotoDto(
    val id: String,
    val tripId: String,
    val ownerType: String,
    val ownerId: String,
    val mimeType: String,
    val sizeBytes: Int,
    val originalFilename: String,
    val isPrimary: Boolean = false,
    val isPrivate: Boolean = false,
    val createdAt: String,
)
