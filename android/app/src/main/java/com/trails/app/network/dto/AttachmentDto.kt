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

/**
 * User-requested: "make it so anywhere I can upload a photo it's also
 * possible to just post an image URL, that way the user does not have to
 * actually download the photo first."
 *
 * `POST /api/v1/photos` accepts two intake shapes on the same path, selected
 * by Content-Type: the existing `@Multipart` upload, or this JSON body. The
 * server fetches the bytes itself and stores them exactly like an upload, so
 * the `PhotoDto` that comes back is indistinguishable from an uploaded one --
 * FileCacheManager caches it offline the same way, and it can be made the
 * Cover Photo like any other.
 */
@Serializable
data class PhotoUrlRequest(
    val ownerType: String,
    val ownerId: String,
    val sourceUrl: String,
    val isPrivate: Boolean = false,
)

/** The same URL-import shape for `POST /api/v1/attachments` (PDF allowed too). */
@Serializable
data class AttachmentUrlRequest(
    val ownerType: String,
    val ownerId: String,
    val sourceUrl: String,
)
