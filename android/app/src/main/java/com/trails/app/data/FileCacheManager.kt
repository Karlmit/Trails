package com.trails.app.data

import android.content.Context
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.TrailsApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Downloads Attachment/Photo bytes into this app's private storage --
 * the actual offline-documents promise (Phase 3). Files live under
 * filesDir so they're removed automatically if the app is uninstalled, and
 * are never exposed outside this app except via FileProvider (documents
 * screen, entry detail's photo viewer).
 */
@Singleton
class FileCacheManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: TrailsApiService,
) {
    suspend fun downloadAttachment(attachment: AttachmentEntity): String = withContext(Dispatchers.IO) {
        val response = api.downloadAttachment(attachment.id)
        if (!response.isSuccessful) throw IOException("Attachment download failed: HTTP ${response.code()}")
        val body = response.body() ?: throw IOException("Empty attachment body")
        val dir = File(context.filesDir, "attachments/${attachment.tripId}").apply { mkdirs() }
        val file = File(dir, "${attachment.id}-${sanitizeFilename(attachment.originalFilename)}")
        body.byteStream().use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        file.absolutePath
    }

    suspend fun downloadPhoto(photo: PhotoEntity): String = withContext(Dispatchers.IO) {
        val response = api.downloadPhoto(photo.id)
        if (!response.isSuccessful) throw IOException("Photo download failed: HTTP ${response.code()}")
        val body = response.body() ?: throw IOException("Empty photo body")
        val dir = File(context.filesDir, "photos/${photo.tripId}").apply { mkdirs() }
        val file = File(dir, "${photo.id}-${sanitizeFilename(photo.originalFilename)}")
        body.byteStream().use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        file.absolutePath
    }

    private fun sanitizeFilename(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
}
