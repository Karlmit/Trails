package com.trails.app.data

import com.trails.app.network.BlogPublishTimeout
import com.trails.app.network.TrailsApiService
import com.trails.app.network.apiErrorMessage
import com.trails.app.network.dto.PhotoDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.URLEncoder
import java.security.MessageDigest

internal const val BLOG_PHOTO_PART_BYTES = 256 * 1024

/** Returns null when an older server has no resumable photo endpoint. */
internal suspend fun uploadBlogPhotoInParts(
    api: TrailsApiService,
    entryId: String,
    uploadId: String,
    file: File,
    filename: String,
    mimeType: String,
    onBytesSent: (Long) -> Unit,
): PhotoDto? {
    val (size, digest) = withContext(Dispatchers.IO) {
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                hash.update(buffer, 0, count)
            }
        }
        file.length() to hash.digest().joinToString("") { "%02x".format(it) }
    }
    val timeout = BlogPublishTimeout
    val encodedName = URLEncoder.encode(filename, "UTF-8").replace("+", "%20")
    var result = try {
        api.blogPhotoUploadStatus(entryId, uploadId, encodedName, mimeType, size, digest, timeout)
    } catch (failure: HttpException) {
        if (failure.code() == 404 && failure.apiErrorMessage() == null) return null
        throw failure
    }
    while (true) {
        result.photo?.let {
            onBytesSent(size)
            return it
        }
        val part = result.nextPart
        val start = part.toLong() * BLOG_PHOTO_PART_BYTES
        if (part < 0 || start >= size) throw IOException("Invalid photo upload checkpoint")
        onBytesSent(start)
        val bytes = withContext(Dispatchers.IO) {
            val content = ByteArray(minOf(BLOG_PHOTO_PART_BYTES.toLong(), size - start).toInt())
            RandomAccessFile(file, "r").use {
                it.seek(start)
                it.readFully(content)
            }
            content
        }
        result = api.uploadBlogPhotoPart(
            entryId, uploadId, encodedName, mimeType, size, digest, part,
            bytes.toRequestBody("application/octet-stream".toMediaType()), timeout,
        )
        if (result.photo == null && result.nextPart <= part) throw IOException("Photo upload did not advance")
    }
}
