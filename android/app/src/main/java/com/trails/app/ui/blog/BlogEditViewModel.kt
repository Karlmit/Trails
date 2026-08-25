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
}

data class BlogEditState(
    val entryId: String? = null,
    val title: String = "",
    val startAt: String = "",
    val blocks: List<EditableBlock> = listOf(EditableBlock.Text(UUID.randomUUID().toString(), TextBlockKind.PARAGRAPH, listOf(InlineRun("")))),
    val lostFormattingWarning: Boolean = false,
    val isPrivate: Boolean = false,
    val isPublished: Boolean = false,
    val saving: Boolean = false,
    val uploadingImage: Boolean = false,
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
                        isPublished = existing.publishedAt != null,
                        blocks = parsed.blocks.ifEmpty { listOf(EditableBlock.Text(UUID.randomUUID().toString(), TextBlockKind.PARAGRAPH, listOf(InlineRun("")))) },
                        lostFormattingWarning = parsed.lostFormatting,
                    )
                }
            }
        }
    }

    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onStartAtChange(v: String) { _state.value = _state.value.copy(startAt = v) }
    fun onIsPrivateChange(v: Boolean) { _state.value = _state.value.copy(isPrivate = v) }

    fun updateRuns(id: String, runs: List<InlineRun>) {
        _state.value = _state.value.copy(
            blocks = _state.value.blocks.map { if (it is EditableBlock.Text && it.id == id) it.copy(runs = runs) else it },
        )
    }

    fun setBlockKind(id: String, kind: TextBlockKind) {
        _state.value = _state.value.copy(
            blocks = _state.value.blocks.map { if (it is EditableBlock.Text && it.id == id) it.copy(kind = kind) else it },
        )
    }

    /** Continues a bullet/numbered list on Enter (matches every other list editor); any other kind gets a fresh plain paragraph. */
    fun addTextBlockAfter(id: String) {
        val current = _state.value
        val index = current.blocks.indexOfFirst { blockId(it) == id }
        val previous = current.blocks.getOrNull(index) as? EditableBlock.Text
        val kind = previous?.kind?.takeIf { it == TextBlockKind.BULLET_LIST || it == TextBlockKind.NUMBERED_LIST } ?: TextBlockKind.PARAGRAPH
        val newBlock = EditableBlock.Text(UUID.randomUUID().toString(), kind, listOf(InlineRun("")))
        val updated = current.blocks.toMutableList().apply { add(if (index >= 0) index + 1 else size, newBlock) }
        _state.value = current.copy(blocks = updated)
    }

    fun removeBlock(id: String) {
        val updated = _state.value.blocks.filterNot { blockId(it) == id }
        _state.value = _state.value.copy(blocks = updated.ifEmpty { listOf(EditableBlock.Text(UUID.randomUUID().toString(), TextBlockKind.PARAGRAPH, listOf(InlineRun("")))) })
    }

    private fun blockId(block: EditableBlock): String = when (block) {
        is EditableBlock.Text -> block.id
        is EditableBlock.Image -> block.id
    }

    /** Lazily creates the Draft on the very first image (or explicit save) -- same convention as BlogPostForm.tsx's own ensurePostId. */
    private suspend fun ensurePostId(untitledLabel: String): String {
        _state.value.entryId?.let { return it }
        creatingPostId?.let { return it.await() }

        val deferred = CompletableDeferred<String>()
        creatingPostId = deferred
        try {
            val current = _state.value
            val tripStartDate = runCatching { tripRepository.observeTrip(tripId).first()?.startDate }.getOrNull()
            val request = BlogPostRequest(
                tripId = tripId,
                title = current.title.trim().ifEmpty { untitledLabel },
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

    fun insertImage(uri: Uri, filename: String, untitledLabel: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingImage = true, error = null)
            runCatching {
                val postId = ensurePostId(untitledLabel)
                documentsRepository.uploadPhoto(OWNER_TYPE, postId, uri, filename)
            }.onSuccess { photo ->
                val newBlock = EditableBlock.Image(UUID.randomUUID().toString(), photo.id)
                _state.value = _state.value.copy(uploadingImage = false, blocks = _state.value.blocks + newBlock)
            }.onFailure { e ->
                val error = e.message?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(R.string.blog_error_upload_failed)
                _state.value = _state.value.copy(uploadingImage = false, error = error)
            }
        }
    }

    fun save(untitledLabel: String) {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = BlogEditError.Resource(R.string.blog_error_title_required))
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                val postId = ensurePostId(untitledLabel)
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
                val error = e.message?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(R.string.blog_error_save_failed)
                _state.value = _state.value.copy(saving = false, error = error)
            }
        }
    }

    fun publish() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.publishBlogPost(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, saved = true) }
                .onFailure { e ->
                    val error = e.message?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(R.string.blog_error_publish_failed)
                    _state.value = _state.value.copy(saving = false, error = error)
                }
        }
    }

    fun unpublish() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.unpublishBlogPost(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    val error = e.message?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(R.string.blog_error_unpublish_failed)
                    _state.value = _state.value.copy(saving = false, error = error)
                }
        }
    }

    fun delete() {
        val id = _state.value.entryId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.deleteTimelineEntry(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    val error = e.message?.let { BlogEditError.Message(it) } ?: BlogEditError.Resource(R.string.blog_error_delete_failed)
                    _state.value = _state.value.copy(saving = false, error = error)
                }
        }
    }
}
