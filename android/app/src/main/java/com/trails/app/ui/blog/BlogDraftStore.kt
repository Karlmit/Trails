package com.trails.app.ui.blog

import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.trails.app.auth.TokenStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

internal const val LOCAL_BLOG_PREFIX = "local-"
private val supportedMediaTypes = setOf("image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm")

@Serializable
data class DraftPhoto(
    val filename: String,
    val fileId: String? = null,
    val mimeType: String? = null,
    val sourceUrl: String? = null,
    val uploadedId: String? = null,
)

@Serializable
data class DeviceBlogDraft(
    val id: String,
    val entryId: String?,
    val title: String,
    val startAt: String,
    val blocks: List<EditableBlock>,
    val pendingPhotos: Map<String, DraftPhoto>,
    val isPrivate: Boolean,
    val isPublished: Boolean,
    val lostFormattingWarning: Boolean = false,
)

@Singleton
class BlogDraftStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val tokens: TokenStore,
) {
    private val preferences = PreferenceDataStoreFactory.create { File(context.noBackupFilesDir, "blog_drafts.preferences_pb") }
    private val fileRoot = File(context.noBackupFilesDir, "blog-draft-photos")
    private val writes = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }

    private fun scopeKey(username: String, tripId: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(json.encodeToString(listOf(username, tripId)).toByteArray())
            .joinToString("") { "%02x".format(it) }

    internal fun observeScope(tripId: String): Flow<String?> =
        tokens.username.map { username -> username?.let { scopeKey(it, tripId) } }

    suspend fun scopeFor(tripId: String): String = checkNotNull(observeScope(tripId).first())

    fun observe(tripId: String): Flow<List<DeviceBlogDraft>> = tokens.username.flatMapLatest { username ->
        if (username == null) flowOf(emptyList()) else {
            val prefix = "${scopeKey(username, tripId)}:"
            preferences.data.map { prefs ->
                prefs.asMap().mapNotNull { (key, value) ->
                    if (key.name.startsWith(prefix) && value is String) runCatching { json.decodeFromString<DeviceBlogDraft>(value) }.getOrNull()
                    else null
                }.sortedBy { it.title.lowercase() }
            }
        }
    }

    suspend fun load(scope: String, id: String): DeviceBlogDraft? =
        preferences.data.first()[stringPreferencesKey("$scope:$id")]?.let(json::decodeFromString)

    // Enqueue the transaction before returning so a later save or delete follows it.
    // The application scope lets queued writes finish when the editor leaves composition.
    fun save(scope: String, draft: DeviceBlogDraft): Deferred<Result<Unit>> =
        writes.async(start = CoroutineStart.UNDISPATCHED) {
            runCatching {
                preferences.edit { it[stringPreferencesKey("$scope:${draft.id}")] = json.encodeToString(draft) }
                Unit
            }
        }

    suspend fun delete(scope: String, id: String) {
        preferences.edit { it.remove(stringPreferencesKey("$scope:$id")) }
    }

    fun photoFile(scope: String, photo: DraftPhoto): File? =
        photo.fileId?.let { File(File(fileRoot, scope), it) }

    suspend fun stage(scope: String, uri: Uri, filename: String): DraftPhoto = withContext(Dispatchers.IO) {
        val mimeType = context.contentResolver.getType(uri)
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(filename.substringAfterLast('.', "").lowercase())
            ?: throw IOException("Unknown media type")
        if (mimeType !in supportedMediaTypes) throw IOException("Unsupported media type")
        val photo = DraftPhoto(filename = filename.take(255), fileId = UUID.randomUUID().toString(), mimeType = mimeType)
        val file = checkNotNull(photoFile(scope, photo))
        file.parentFile?.mkdirs()
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                file.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IOException("Could not open media file")
            if (file.length() == 0L) throw IOException("Empty media file")
            photo
        } catch (failure: Exception) {
            file.delete()
            throw failure
        }
    }

    suspend fun deletePhoto(scope: String, photo: DraftPhoto) {
        withContext(Dispatchers.IO) { photoFile(scope, photo)?.delete() }
    }
}
