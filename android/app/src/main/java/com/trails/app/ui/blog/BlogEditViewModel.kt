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
import com.trails.app.network.dto.BlogPostRequest
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
import java.time.LocalDate
import java.util.UUID
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
    data class ImageBatch(val failures: List<ImageUploadFailure>) : BlogEditError()
    data class PublishFailure(val reason: String?) : BlogEditError()
}

data class ImageUploadFailure(val filename: String, val reason: String?)

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

    fun removeBlock(id: String) {
        val current = _state.value
        if (!current.ready || current.saving || current.stagingImages) return
        val removed = current.pendingPhotos[id]
        val remaining = current.blocks.filterNot { it.id == id }
        val updated = current.copy(
            blocks = remaining.ifEmpty { BlogEditState().blocks },
            pendingPhotos = current.pendingPhotos - id,
        )
        edit(
            afterWrite = if (removed != null) ({ draftStore.deletePhoto(draftScope, removed) }) else null,
        ) { updated }
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
        val image = EditableBlock.Image(id, photo.uploadedId ?: id)
        val blocks = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, image) }
        current.copy(blocks = blocks, pendingPhotos = current.pendingPhotos + (id to photo))
    }

    fun insertImages(uris: List<Uri>, displayName: (Uri) -> String, afterId: String? = null) {
        val current = _state.value
        if (uris.isEmpty() || !current.ready || current.stagingImages || current.saving) return
        _state.value = current.copy(stagingImages = true, error = null)
        viewModelScope.launch {
            try {
                var insertionId = afterId
                val failures = mutableListOf<ImageUploadFailure>()
                for (uri in uris) {
                    var filename = uri.lastPathSegment ?: "file"
                    try {
                        filename = withContext(Dispatchers.IO) { displayName(uri) }
                        ensureActive()
                        withContext(NonCancellable) {
                            val photo = draftStore.stage(draftScope, uri, filename)
                            val id = UUID.randomUUID().toString()
                            insertPhotoAfter(insertionId, id, photo)
                            insertionId = id
                        }
                    } catch (failure: CancellationException) {
                        throw failure
                    } catch (_: Exception) {
                        failures += ImageUploadFailure(filename, null)
                    }
                }
                if (failures.isNotEmpty()) _state.value = _state.value.copy(error = BlogEditError.ImageBatch(failures))
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
        _state.value = current.copy(saving = true, publishing = true, error = null)
        viewModelScope.launch {
            try {
                persist()
                val request = BlogPostRequest(
                    tripId = tripId, title = current.title.trim(), startAt = current.startAt,
                    isPrivate = current.isPrivate,
                )
                val id = current.entryId ?: repository.createBlogPost(request).id.also { createdId ->
                    _state.value = _state.value.copy(entryId = createdId)
                    persist()
                }
                val remoteBlocks = current.blocks.map { block ->
                    val photo = current.pendingPhotos[block.id]
                    if (block is EditableBlock.Image && photo != null) {
                        val uploadedId = photo.uploadedId ?: uploadPhoto(id, block.id, photo)
                        block.copy(photoId = uploadedId)
                    } else block
                }
                repository.updateBlogPost(id, request.copy(description = encodeEditableBlocks(remoteBlocks)), cacheLocally = current.isPublished)
                if (!current.isPublished) repository.publishBlogPost(id)
                _state.value = _state.value.copy(isPublished = true)
                persist()
                clearDraft()
                _state.value = _state.value.copy(saved = true, isPublished = true)
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Exception) {
                _state.value = _state.value.copy(error = BlogEditError.PublishFailure(failure.apiErrorMessage()))
            } finally {
                _state.value = _state.value.copy(saving = false, publishing = false)
            }
        }
    }

    private suspend fun uploadPhoto(entryId: String, blockId: String, photo: DraftPhoto): String {
        val file = localPhoto(photo)
        val uploaded = if (photo.sourceUrl != null) {
            documentsRepository.importPhotoFromUrl(OWNER_TYPE, entryId, photo.sourceUrl, cacheLocally = false)
        } else {
            documentsRepository.uploadStagedPhoto(
                OWNER_TYPE, entryId, checkNotNull(file), photo.filename,
                checkNotNull(photo.mimeType), isPrivate = false,
            )
        }
        val updated = _state.value.pendingPhotos + (blockId to photo.copy(uploadedId = uploaded.id))
        _state.value = _state.value.copy(pendingPhotos = updated)
        persist()
        if (file != null) {
            try {
                documentsRepository.cacheStagedPhoto(uploaded, file)
            } catch (failure: CancellationException) {
                throw failure
            } catch (_: Exception) {
                // The server copy already exists. Trip sync can rebuild its cache.
            }
        }
        return uploaded.id
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
