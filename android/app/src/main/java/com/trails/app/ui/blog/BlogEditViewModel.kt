package com.trails.app.ui.blog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.network.dto.BlogPostRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.UUID
import javax.inject.Inject

/**
 * Only plain paragraphs round-trip here (no formatting, lists, or inline
 * images) -- a real BlockNote-equivalent editor is future work. Existing
 * richer content (headings, layoutImage blocks, etc.) is intentionally
 * never loaded into this editor: [loadFrom] only pre-fills the title/date/
 * privacy fields and leaves the body blank, so saving never clobbers a
 * post's images or formatting with flattened plain text.
 */
fun encodeParagraphs(text: String): String {
    val paragraphs = text.split("\n\n").map { it.trim() }.filter { it.isNotEmpty() }
    val array = buildJsonArray {
        paragraphs.forEach { paragraph ->
            add(
                buildJsonObject {
                    put("id", UUID.randomUUID().toString())
                    put("type", "paragraph")
                    putJsonArray("content") {
                        add(
                            buildJsonObject {
                                put("type", "text")
                                put("text", paragraph)
                                put("styles", buildJsonObject { })
                            },
                        )
                    }
                    putJsonArray("children") {}
                },
            )
        }
    }
    return Json.encodeToString(JsonArray.serializer(), array)
}

data class BlogEditState(
    val entryId: String? = null,
    val title: String = "",
    val startAt: String = "",
    val body: String = "",
    val isPrivate: Boolean = false,
    val hasRichContent: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class BlogEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: TimelineRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val entryId: String? = savedStateHandle.get<String>("entryId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(BlogEditState(entryId = entryId))
    val state: StateFlow<BlogEditState> = _state.asStateFlow()

    init {
        entryId?.let { id ->
            viewModelScope.launch {
                val entry = repository.observeEntry(id).first()
                entry?.let { existing ->
                    val blocks = parseBlogBlocks(existing.description)
                    val onlyText = blocks.all { it is BlogBlock.TextBlock }
                    _state.value = _state.value.copy(
                        title = existing.title,
                        startAt = existing.startAt,
                        isPrivate = existing.isPrivate,
                        body = if (onlyText) blocks.filterIsInstance<BlogBlock.TextBlock>().joinToString("\n\n") { it.text } else "",
                        hasRichContent = !onlyText,
                    )
                }
            }
        }
    }

    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onStartAtChange(v: String) { _state.value = _state.value.copy(startAt = v) }
    fun onBodyChange(v: String) { _state.value = _state.value.copy(body = v) }
    fun onIsPrivateChange(v: Boolean) { _state.value = _state.value.copy(isPrivate = v) }

    fun save() {
        val current = _state.value
        if (current.title.isBlank() || current.startAt.isBlank()) {
            _state.value = current.copy(error = "Title and date are required.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            val request = BlogPostRequest(
                tripId = tripId,
                title = current.title.trim(),
                description = if (current.hasRichContent) null else encodeParagraphs(current.body),
                startAt = current.startAt,
                isPrivate = current.isPrivate,
            )
            runCatching {
                if (current.entryId == null) repository.createBlogPost(request) else repository.updateBlogPost(current.entryId, request)
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
