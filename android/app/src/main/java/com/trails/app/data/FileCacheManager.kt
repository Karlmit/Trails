package com.trails.app.data

import android.content.Context
import android.net.Uri
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.TrailsApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
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

    /**
     * Copies a content:// Uri picked from the system file/photo picker into a
     * cache file so it can be wrapped in a plain File-backed RequestBody --
     * Retrofit's Multipart part needs a stable length upfront, which a
     * streaming ContentResolver InputStream can't offer.
     */
    suspend fun prepareUploadPart(uri: Uri, partName: String, filename: String): MultipartBody.Part =
        withContext(Dispatchers.IO) {
            val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
            val dir = File(context.cacheDir, "uploads").apply { mkdirs() }
            val file = File(dir, "${System.nanoTime()}-${sanitizeFilename(filename)}")
            context.contentResolver.openInputStream(uri)?.use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IOException("Could not open picked file")
            val body = file.asRequestBody(mimeType.toMediaTypeOrNull())
            MultipartBody.Part.createFormData(partName, filename, body)
        }

    private fun sanitizeFilename(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
}
