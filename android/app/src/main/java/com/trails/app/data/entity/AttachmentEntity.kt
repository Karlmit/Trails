package com.trails.app.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "attachments", indices = [Index("tripId"), Index("ownerType", "ownerId")])
data class AttachmentEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val ownerType: String,
    val ownerId: String,
    val mimeType: String,
    val sizeBytes: Int,
    val originalFilename: String,
    val createdAt: String,
    // Null until FileCacheManager has downloaded the bytes; set to an
    // absolute path under this app's private storage once cached.
    val localPath: String? = null,
)

@Entity(tableName = "photos", indices = [Index("tripId"), Index("ownerType", "ownerId")])
data class PhotoEntity(
    @PrimaryKey val id: String,
    val tripId: String,
    val ownerType: String,
    val ownerId: String,
    val mimeType: String,
    val sizeBytes: Int,
    val originalFilename: String,
    val isPrimary: Boolean,
    val isPrivate: Boolean,
    val createdAt: String,
    val localPath: String? = null,
)
