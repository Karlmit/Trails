package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class BlogPhotoUploadDto(val nextPart: Int, val photo: PhotoDto? = null)
