package com.trails.app.ui.blog

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.TripRepository
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.dto.BlogPostRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CompletableDeferred
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
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

private const val OWNER_TYPE = "TIMELINE_ENTRY"

data class BlogEditState(
    val entryId: String? = null,
    val title: String = "",
    val startAt: String = "",
    val blocks: List<EditableBlock> = listOf(EditableBlock.Paragraph(UUID.randomUUID().toString(), "")),
    val lostFormattingWarning: Boolean = false,
    val isPrivate: Boolean = false,
    val saving: Boolean = false,
    val uploadingImage: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

/**
 * A block-based editor -- paragraphs you can edit inline, images you can
 * insert via the system photo picker -- rather than the previous single
 * plain-text field, which had no way to add an image at all. Mirrors the
 * web's own BlockNote-backed editor closely enough to round-trip: see
 * EditableBlocks.kt's own comment for exactly what's preserved
 * (paragraphs + images) versus flattened (headings, lists, any other
 * BlockNote block type -- [BlogEditState.lostFormattingWarning] surfaces
 * that once rather than silently discarding it).
 */
@HiltViewModel
class BlogEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
    private val tripRepository: TripRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val entryId: String? = savedStateHandle.get<String>("entryId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(BlogEditState(entryId = entryId))
    val state: StateFlow<BlogEditState> = _state.asStateFlow()

    // Same "in-flight create, don't fire a second one" guard as
    // BlogPostForm.tsx's own ensurePostId -- two images added in quick
    // succession before the first upload's create call returns must share
    // that one create, not each lazily create their own Draft.
    private var creatingPostId: CompletableDeferred<String>? = null

    val photosById: StateFlow<Map<String, PhotoEntity>> = _state
        .map { it.entryId }
        .distinctUntilChanged()
        .flatMapLatest { id -> if (id != null) documentsRepository.observePhotosForOwner(OWNER_TYPE, id) else flowOf(emptyList()) }
        .map { photos -> photos.associateBy { it.id } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    init {
        entryId?.let { id ->
            viewModelScope.launch {
                val entry = repository.observeEntry(id).first()
                entry?.let { existing ->
                    val parsed = parseEditableBlocks(existing.description)
                    _state.value = _state.value.copy(
                        title = existing.title,
                        startAt = existing.startAt,
                        isPrivate = existing.isPrivate,
                        blocks = parsed.blocks.ifEmpty { listOf(EditableBlock.Paragraph(UUID.randomUUID().toString(), "")) },
                        lostFormattingWarning = parsed.lostFormatting,
                    )
                }
            }
        }
    }

    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onStartAtChange(v: String) { _state.value = _state.value.copy(startAt = v) }
    fun onIsPrivateChange(v: Boolean) { _state.value = _state.value.copy(isPrivate = v) }

    fun updateParagraph(id: String, text: String) {
        _state.value = _state.value.copy(
            blocks = _state.value.blocks.map { if (it is EditableBlock.Paragraph && it.id == id) it.copy(text = text) else it },
        )
    }

    fun addParagraphAfter(id: String) {
        val current = _state.value
        val index = current.blocks.indexOfFirst { blockId(it) == id }
        val newBlock = EditableBlock.Paragraph(UUID.randomUUID().toString(), "")
        val updated = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, newBlock) }
        _state.value = current.copy(blocks = updated)
    }

    fun removeBlock(id: String) {
        val updated = _state.value.blocks.filterNot { blockId(it) == id }
        _state.value = _state.value.copy(blocks = updated.ifEmpty { listOf(EditableBlock.Paragraph(UUID.randomUUID().toString(), "")) })
    }

    private fun blockId(block: EditableBlock): String = when (block) {
        is EditableBlock.Paragraph -> block.id
        is EditableBlock.Image -> block.id
    }

    /** Lazily creates the Draft on the very first image (or explicit save) -- same convention as BlogPostForm.tsx's own ensurePostId. */
    private suspend fun ensurePostId(): String {
        _state.value.entryId?.let { return it }
        creatingPostId?.let { return it.await() }

        val deferred = CompletableDeferred<String>()
        creatingPostId = deferred
        try {
            val current = _state.value
            val tripStartDate = runCatching { tripRepository.observeTrip(tripId).first()?.startDate }.getOrNull()
            val request = BlogPostRequest(
                tripId = tripId,
                title = current.title.trim().ifEmpty { "Untitled" },
                description = null,
                startAt = current.startAt.ifBlank { tripStartDate ?: LocalDate.now().toString() },
                isPrivate = current.isPrivate,
            )
            val created = repository.createBlogPost(request)
            _state.value = _state.value.copy(entryId = created.id, startAt = _state.value.startAt.ifBlank { request.startAt })
            deferred.complete(created.id)
            return created.id
        } catch (e: Exception) {
            deferred.completeExceptionally(e)
            throw e
        } finally {
            creatingPostId = null
        }
    }

    fun insertImage(uri: Uri, filename: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingImage = true, error = null)
            runCatching {
                val postId = ensurePostId()
                documentsRepository.uploadPhoto(OWNER_TYPE, postId, uri, filename)
            }.onSuccess { photo ->
                val newBlock = EditableBlock.Image(UUID.randomUUID().toString(), photo.id)
                _state.value = _state.value.copy(uploadingImage = false, blocks = _state.value.blocks + newBlock)
            }.onFailure { e ->
                _state.value = _state.value.copy(uploadingImage = false, error = e.message ?: "Could not upload this image.")
            }
        }
    }

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = "Title is required.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                val postId = ensurePostId()
                val request = BlogPostRequest(
                    tripId = tripId,
                    title = current.title.trim(),
                    description = encodeEditableBlocks(current.blocks),
                    startAt = current.startAt,
                    isPrivate = current.isPrivate,
                )
                repository.updateBlogPost(postId, request)
            }.onSuccess { result ->
                _state.value = _state.value.copy(saving = false, saved = true, entryId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save Blog Post.")
            }
        }
    }

    fun publish() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.publishBlogPost(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, saved = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to publish.") }
        }
    }

    fun unpublish() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.unpublishBlogPost(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to unpublish.") }
        }
    }

    fun delete() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.deleteTimelineEntry(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete.") }
        }
    }
}
