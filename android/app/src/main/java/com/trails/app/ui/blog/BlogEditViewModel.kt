package com.trails.app.ui.blog

import android.net.Uri
import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.apiErrorMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.time.LocalDate
import java.util.UUID
import retrofit2.HttpException
import javax.inject.Inject

private const val OWNER_TYPE = "TIMELINE_ENTRY"

/**
 * A ViewModel can't call `stringResource()` (Compose-only), so a hardcoded
 * literal error/status message is represented as a [Resource] the
 * Composable resolves via `stringResource(id)`, while a message that
 * genuinely came from a thrown exception (`e.message`, not under this
 * app's translation control) stays a plain [Message].
 */
sealed class BlogEditError {
    data class Message(val text: String) : BlogEditError()
    data class Resource(@StringRes val resId: Int) : BlogEditError()
    data class ImageBatch(val failures: List<ImageUploadFailure>, val skippedForCapacity: Int = 0) : BlogEditError()
    data class PublishFailure(
        val reason: String?,
        @StringRes val reasonRes: Int?,
        val httpStatus: Int?,
        val photoName: String?,
    ) : BlogEditError()
}

internal fun publishFailure(failure: Exception, photoName: String?): BlogEditError.PublishFailure {
    val reason = failure.apiErrorMessage()
    val status = (failure as? HttpException)?.code()
    val reasonRes = if (reason == null && status == null) when (failure) {
        is SocketTimeoutException -> R.string.blog_publish_timeout
        is UnknownHostException, is ConnectException, is SocketException -> R.string.blog_publish_connection
        is FileNotFoundException -> R.string.blog_publish_file_missing
        is IOException -> R.string.blog_publish_interrupted
        else -> R.string.blog_publish_unexpected
    } else null
    return BlogEditError.PublishFailure(reason, reasonRes, status, photoName)
}

data class ImageUploadFailure(val filename: String, val reason: String?)

data class BlogUploadProgress(
    val totalPhotos: Int,
    val completedPhotos: Int,
    val totalBytes: Long,
    val sentBytes: Long = 0L,
    val currentPhotoFraction: Float = 0f,
    val remainingSeconds: Int? = null,
    val importingUrl: Boolean = false,
    val retryingSmaller: Boolean = false,
) {
    val fraction: Float
        get() = (completedPhotos + currentPhotoFraction) / totalPhotos.coerceAtLeast(1)

    internal fun sending(
        photoBytes: Long, bytes: Long, elapsedMillis: Long, hasPendingImports: Boolean, resumedBytes: Long = 0L,
    ): BlogUploadProgress {
        val transferred = bytes.coerceIn(0L, photoBytes)
        val sent = sentBytes + transferred
        val transferredThisAttempt = transferred - resumedBytes
        val remaining = if (!hasPendingImports && transferredThisAttempt > 0L && elapsedMillis >= 1000L && sent < totalBytes) {
            kotlin.math.ceil((totalBytes - sent).toDouble() / transferredThisAttempt * elapsedMillis / 1000)
                .coerceAtMost(Int.MAX_VALUE.toDouble()).toInt()
        } else null
        return copy(
            sentBytes = sent,
            currentPhotoFraction = if (photoBytes > 0) (transferred.toFloat() / photoBytes).coerceAtMost(0.99f) else 0f,
            remainingSeconds = remaining,
        )
    }
}

data class BlogEditState(
    val entryId: String? = null,
    val ready: Boolean = false,
    val title: String = "",
    val startAt: String = "",
    val blocks: List<EditableBlock> = listOf(EditableBlock.Text(UUID.randomUUID().toString(), TextBlockKind.PARAGRAPH, listOf(InlineRun("")))),
    val pendingPhotos: Map<String, DraftPhoto> = emptyMap(),
    val lostFormattingWarning: Boolean = false,
    val isPrivate: Boolean = false,
    val isPublished: Boolean = false,
    val saving: Boolean = false,
    val stagingImages: Boolean = false,
    val publishing: Boolean = false,
    val uploadProgress: BlogUploadProgress? = null,
    val error: BlogEditError? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

/**
 * A block-based editor -- paragraphs/headings you can edit inline, with
 * real live bold/italic/underline (RichTextField.kt), images you can
 * insert via the system photo picker -- rather than the previous single
 * plain-text field, which had no way to add an image at all. Mirrors the
 * web's own BlockNote-backed editor closely enough to round-trip: see
 * EditableBlocks.kt's own comment for exactly what's preserved (text
 * formatting, headings, images) versus flattened (lists, tables, any other
 * BlockNote block type -- [BlogEditState.lostFormattingWarning] surfaces
 * that once rather than silently discarding it).
 */
@HiltViewModel
class BlogEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
    private val tripRepository: TripRepository,
    private val draftStore: BlogDraftStore,
    private val backgroundPublish: BlogPublishCoordinator,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val routeId: String = savedStateHandle.get<String>("entryId")
        ?.takeUnless { it == "new" }
        ?: savedStateHandle.get<String>("deviceDraftId")
        ?: "$LOCAL_BLOG_PREFIX${UUID.randomUUID()}".also { savedStateHandle["deviceDraftId"] = it }
    private val originalEntryId = routeId.takeUnless { it.startsWith(LOCAL_BLOG_PREFIX) }
    private lateinit var draftScope: String
    private var hasDraft = false

    private val _state = MutableStateFlow(BlogEditState(entryId = originalEntryId))
    val state: StateFlow<BlogEditState> = _state.asStateFlow()

    val photosById: StateFlow<Map<String, PhotoEntity>> = _state
        .map { it.entryId }
        .distinctUntilChanged()
        .flatMapLatest { id -> if (id != null) documentsRepository.observePhotosForOwner(OWNER_TYPE, id) else flowOf(emptyList()) }
        .map { photos -> photos.associateBy { it.id } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    init {
        viewModelScope.launch {
            try {
                draftScope = draftStore.scopeFor(tripId)
                backgroundPublish.active(BlogPublishKey(tripId, draftScope, routeId))?.let {
                    observePublish(it)
                    return@launch
                }
                val draft = draftStore.load(draftScope, routeId)
                if (draft != null) {
                    hasDraft = true
                    _state.value = BlogEditState(
                        ready = true, entryId = draft.entryId, title = draft.title, startAt = draft.startAt,
                        blocks = draft.blocks, pendingPhotos = draft.pendingPhotos,
                        isPrivate = draft.isPrivate, isPublished = draft.isPublished,
                        lostFormattingWarning = draft.lostFormattingWarning,
                    )
                } else {
                    val entry = originalEntryId?.let { repository.observeEntry(it).first() }
                    val parsed = parseEditableBlocks(entry?.description)
                    val initial = _state.value
                    val startAt = entry?.startAt ?: tripRepository.observeTrip(tripId).first()?.startDate
                    _state.value = initial.copy(
                        ready = originalEntryId == null || entry != null,
                        title = entry?.title.orEmpty(),
                        startAt = startAt ?: LocalDate.now().toString(),
                        isPrivate = entry?.isPrivate ?: false,
                        isPublished = entry?.publishedAt != null,
                        blocks = parsed.blocks.ifEmpty { initial.blocks },
                        lostFormattingWarning = parsed.lostFormatting,
                        error = if (originalEntryId != null && entry == null) {
                            BlogEditError.Resource(R.string.blog_error_draft_load)
                        } else null,
                    )
                }
            } catch (failure: CancellationException) {
                throw failure
            } catch (_: Exception) {
                _state.value = _state.value.copy(error = BlogEditError.Resource(R.string.blog_error_draft_load))
            }
        }
    }

    private fun BlogEditState.toDraft() = DeviceBlogDraft(
        routeId, entryId, title, startAt, blocks, pendingPhotos, isPrivate, isPublished, lostFormattingWarning,
    )

    private fun edit(afterWrite: (suspend () -> Unit)? = null, update: (BlogEditState) -> BlogEditState) {
        val current = _state.value
        if (!current.ready || current.saving) return
        val updated = update(current)
        if (updated == current) return
        _state.value = updated
        hasDraft = true
        val write = draftStore.save(draftScope, updated.toDraft())
        viewModelScope.launch {
            if (write.await().isSuccess) {
                afterWrite?.invoke()
            } else if (!_state.value.saving && !_state.value.saved) {
                _state.value = _state.value.copy(error = BlogEditError.Resource(R.string.blog_error_save_failed))
            }
        }
    }

    private suspend fun persist() {
        withContext(NonCancellable) {
            draftStore.save(draftScope, _state.value.toDraft()).await().getOrThrow()
            hasDraft = true
        }
    }

    internal fun localPhoto(photo: DraftPhoto): File? = draftStore.photoFile(draftScope, photo)

    fun onTitleChange(value: String) = edit { it.copy(title = value) }
    fun onStartAtChange(value: String) = edit { it.copy(startAt = value) }
    fun onIsPrivateChange(value: Boolean) = edit { it.copy(isPrivate = value) }

    fun updateRuns(id: String, runs: List<InlineRun>) = edit { current ->
        current.copy(blocks = current.blocks.map {
            if (it is EditableBlock.Text && it.id == id) it.copy(runs = runs) else it
        })
    }

    fun setBlockKind(id: String, kind: TextBlockKind) = edit { current ->
        current.copy(blocks = current.blocks.map {
            if (it is EditableBlock.Text && it.id == id) it.copy(kind = kind) else it
        })
    }

    /** Continues a bullet/numbered list on Enter (matches every other list editor); any other kind gets a fresh plain paragraph. */
    fun addTextBlockAfter(id: String) {
        val current = _state.value
        val index = current.blocks.indexOfFirst { it.id == id }
        val previous = current.blocks.getOrNull(index) as? EditableBlock.Text
        val kind = previous?.kind?.takeIf { it == TextBlockKind.BULLET_LIST || it == TextBlockKind.NUMBERED_LIST } ?: TextBlockKind.PARAGRAPH
        val newBlock = EditableBlock.Text(UUID.randomUUID().toString(), kind, listOf(InlineRun("")))
        val updated = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, newBlock) }
        edit { it.copy(blocks = updated) }
    }

    fun addCollageAfter(id: String) {
        if (_state.value.stagingImages) return
        edit { current ->
            val index = current.blocks.indexOfFirst { it.id == id }
            val collage = EditableBlock.Collage(UUID.randomUUID().toString(), emptyList())
            val blocks = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, collage) }
            current.copy(blocks = blocks)
        }
    }

    fun removeBlock(id: String) {
        val current = _state.value
        if (!current.ready || current.saving || current.stagingImages) return
        val block = current.blocks.firstOrNull { it.id == id } ?: return
        val remaining = current.blocks.filterNot { it.id == id }
        removePendingPhotos(block.photoItems().map { it.id }, remaining.ifEmpty { BlogEditState().blocks })
    }

    fun removeCollagePhoto(collageId: String, photoId: String) {
        val current = _state.value
        if (!current.ready || current.saving || current.stagingImages) return
        val blocks = current.blocks.map { block ->
            if (block is EditableBlock.Collage && block.id == collageId) {
                if (block.photos.none { it.id == photoId }) return
                block.copy(photos = block.photos.filterNot { it.id == photoId })
            } else block
        }
        if (blocks != current.blocks) removePendingPhotos(listOf(photoId), blocks)
    }

    private fun removePendingPhotos(ids: List<String>, blocks: List<EditableBlock>) {
        val removed = ids.mapNotNull(_state.value.pendingPhotos::get)
        edit(afterWrite = { removed.forEach { draftStore.deletePhoto(draftScope, it) } }) { current ->
            current.copy(blocks = blocks, pendingPhotos = current.pendingPhotos - ids.toSet())
        }
    }

    fun moveBlockBefore(id: String, beforeId: String?) {
        val current = _state.value
        if (current.saving || current.stagingImages || id == beforeId) return
        val block = current.blocks.firstOrNull { it.id == id } ?: return
        val reordered = current.blocks.filterNot { it.id == id }.toMutableList()
        val destination = if (beforeId == null) reordered.size else reordered.indexOfFirst { it.id == beforeId }
        if (destination < 0) return
        reordered.add(destination, block)
        edit { it.copy(blocks = reordered) }
    }

    private fun insertPhotoAfter(afterId: String?, id: String, photo: DraftPhoto) = edit { current ->
        val index = current.blocks.indexOfFirst { it.id == afterId }
        val image = EditableBlock.Image(id, photo.uploadedId ?: id, isVideo = photo.mimeType?.startsWith("video/") == true)
        val blocks = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, image) }
        current.copy(blocks = blocks, pendingPhotos = current.pendingPhotos + (id to photo))
    }

    fun insertImages(uris: List<Uri>, displayName: (Uri) -> String, afterId: String? = null) {
        stageImages(uris, displayName, afterId = afterId)
    }

    fun insertCollagePhotos(collageId: String, uris: List<Uri>, displayName: (Uri) -> String) {
        stageImages(uris, displayName, collageId = collageId)
    }

    private fun stageImages(
        uris: List<Uri>,
        displayName: (Uri) -> String,
        afterId: String? = null,
        collageId: String? = null,
    ) {
        val current = _state.value
        if (uris.isEmpty() || !current.ready || current.stagingImages || current.saving) return
        var slots = if (collageId == null) null else {
            val collage = current.blocks.filterIsInstance<EditableBlock.Collage>().firstOrNull { it.id == collageId } ?: return
            MAX_COLLAGE_PHOTOS - collage.photos.size
        }
        _state.value = current.copy(stagingImages = true, error = null)
        viewModelScope.launch {
            try {
                var insertionId = afterId
                val failures = mutableListOf<ImageUploadFailure>()
                var skippedForCapacity = 0
                for ((index, uri) in uris.withIndex()) {
                    if ((slots ?: Int.MAX_VALUE) <= 0) {
                        skippedForCapacity = uris.size - index
                        break
                    }
                    var filename = uri.lastPathSegment ?: "file"
                    try {
                        filename = withContext(Dispatchers.IO) { displayName(uri) }
                        ensureActive()
                        withContext(NonCancellable) {
                            val photo = draftStore.stage(draftScope, uri, filename)
                            val id = UUID.randomUUID().toString()
                            if (collageId == null) {
                                insertPhotoAfter(insertionId, id, photo)
                                insertionId = id
                            } else {
                                if (photo.mimeType?.startsWith("image/") != true) {
                                    draftStore.deletePhoto(draftScope, photo)
                                    throw IOException("Collages only accept photos")
                                }
                                edit { state ->
                                    val blocks = state.blocks.map { block ->
                                        if (block is EditableBlock.Collage && block.id == collageId) {
                                            block.copy(photos = block.photos + EditableBlock.Image(id, id))
                                        } else block
                                    }
                                    state.copy(blocks = blocks, pendingPhotos = state.pendingPhotos + (id to photo))
                                }
                                slots = checkNotNull(slots) - 1
                            }
                        }
                    } catch (failure: CancellationException) {
                        throw failure
                    } catch (_: Exception) {
                        failures += ImageUploadFailure(filename, null)
                    }
                }
                if (failures.isNotEmpty() || skippedForCapacity > 0) {
                    _state.value = _state.value.copy(error = BlogEditError.ImageBatch(failures, skippedForCapacity))
                }
            } finally {
                _state.value = _state.value.copy(stagingImages = false)
            }
        }
    }

    fun insertImageFromUrl(sourceUrl: String, afterId: String? = null) {
        val current = _state.value
        if (!current.ready || current.stagingImages || current.saving) return
        insertPhotoAfter(afterId, UUID.randomUUID().toString(), DraftPhoto(filename = sourceUrl, sourceUrl = sourceUrl))
    }

    fun save() {
        if (!_state.value.ready || _state.value.stagingImages || _state.value.saving) return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                persist()
                _state.value = _state.value.copy(saved = true)
            } catch (failure: CancellationException) {
                throw failure
            } catch (_: Exception) {
                _state.value = _state.value.copy(error = BlogEditError.Resource(R.string.blog_error_save_failed))
            } finally {
                _state.value = _state.value.copy(saving = false)
            }
        }
    }

    fun publish() {
        val current = _state.value
        if (!current.ready || current.stagingImages || current.saving) return
        if (current.title.isBlank()) {
            _state.value = current.copy(error = BlogEditError.Resource(R.string.blog_error_title_required))
            return
        }
        val task = BlogPublishTask(
            BlogPublishKey(tripId, draftScope, routeId),
            MutableStateFlow(current.copy(saving = true, publishing = true, error = null)),
        )
        if (backgroundPublish.start(task)) {
            observePublish(task)
        } else {
            backgroundPublish.active(task.key)?.let(::observePublish) ?: run {
                _state.value = current.copy(error = BlogEditError.Resource(R.string.blog_error_start_background_publish))
            }
        }
    }

    private fun observePublish(task: BlogPublishTask) {
        _state.value = task.state.value
        hasDraft = true
        viewModelScope.launch {
            task.state.first { updated ->
                _state.value = updated
                if (updated.saved) hasDraft = false
                !updated.publishing
            }
        }
    }

    private suspend fun clearDraft() = withContext(NonCancellable) {
        if (hasDraft) {
            draftStore.delete(draftScope, routeId)
            _state.value.pendingPhotos.values.forEach { draftStore.deletePhoto(draftScope, it) }
            hasDraft = false
        }
    }

    fun unpublish() = finish(R.string.blog_error_unpublish_failed, keepDraft = true) {
        repository.unpublishBlogPost(checkNotNull(_state.value.entryId))
        _state.value = _state.value.copy(isPublished = false)
        persist()
    }

    fun discardDraft() = finish(R.string.blog_error_delete_failed) {}

    fun deletePost() = finish(R.string.blog_error_delete_failed) {
        repository.deleteTimelineEntry(checkNotNull(_state.value.entryId))
    }

    private fun finish(@StringRes errorRes: Int, keepDraft: Boolean = false, action: suspend () -> Unit) {
        val current = _state.value
        if (!current.ready || current.stagingImages || current.saving) return
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                action()
                if (!keepDraft) clearDraft()
                _state.value = _state.value.copy(deleted = true)
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Exception) {
                val error = failure.apiErrorMessage()?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(errorRes)
                _state.value = _state.value.copy(error = error)
            } finally {
                _state.value = _state.value.copy(saving = false)
            }
        }
    }
}
