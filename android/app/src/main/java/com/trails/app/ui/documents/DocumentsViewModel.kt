package com.trails.app.ui.documents

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import com.trails.app.ui.nav.ARG_ATTACHMENT_ID
import com.trails.app.ui.nav.ARG_VIEW_PHOTO
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

// User-requested: "Group the documents by activity or how they been added"
// -- each group is now the specific Timeline Entry/Important Info item a
// document was actually attached to (not the broad entryType it used to
// be grouped by), with that item's own title as the group's header, so
// the per-row subtitle repeating it is no longer needed.
data class DocumentGroup(val emoji: String, val label: String, val rows: List<AttachmentEntity>)

private fun ownerEmoji(entryType: String) = when (entryType) {
    "STAY" -> "🏨"
    "TRANSPORT" -> "🚗"
    "ACTIVITY" -> "🎟️"
    else -> "📝"
}

@HiltViewModel
class DocumentsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val documentsRepository: DocumentsRepository,
    timelineRepository: TimelineRepository,
    importantInfoRepository: ImportantInfoRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])

    // See ChecklistsViewModel's identical init block -- this screen had no
    // sync trigger of its own before, only ever refreshed as a side effect
    // of the Timeline tab having synced first. Now also drives the
    // pull-to-refresh gesture (user-requested).
    private val refresher = TripRefresher(viewModelScope, tripId, syncScheduler)
    val isRefreshing: StateFlow<Boolean> = refresher.isRefreshing
    fun refresh() = refresher.refresh()

    init {
        refresh()
    }

    val groups: StateFlow<List<DocumentGroup>> = combine(
        documentsRepository.observeAttachmentsForTrip(tripId),
        timelineRepository.observeEntries(tripId),
        importantInfoRepository.observeForTrip(tripId),
    ) { attachments, entries, importantInfoItems ->
        val entryById = entries.associateBy { it.id }
        val infoById = importantInfoItems.associateBy { it.id }
        // Grouped by the specific owning item (its id), not just its type --
        // two different Stays must never merge into one "Stay" bucket.
        val groupMeta = linkedMapOf<String, Pair<String, String>>()
        val rowsByKey = linkedMapOf<String, MutableList<AttachmentEntity>>()
        attachments.forEach { attachment ->
            val key = "${attachment.ownerType}:${attachment.ownerId}"
            val meta = when (attachment.ownerType) {
                "TIMELINE_ENTRY" -> entryById[attachment.ownerId]?.let { ownerEmoji(it.entryType) to it.title }
                "IMPORTANT_INFO" -> infoById[attachment.ownerId]?.let { "📌" to it.title }
                else -> null
            } ?: return@forEach
            groupMeta.putIfAbsent(key, meta)
            rowsByKey.getOrPut(key) { mutableListOf() }.add(attachment)
        }
        rowsByKey.map { (key, rows) ->
            val (emoji, label) = groupMeta.getValue(key)
            DocumentGroup(emoji, label, rows)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}

sealed interface DocumentViewerState {
    data object Loading : DocumentViewerState
    data object Error : DocumentViewerState
    data class Ready(val localPath: String, val mimeType: String, val filename: String) : DocumentViewerState
}

@HiltViewModel
class DocumentViewerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<DocumentViewerState>(DocumentViewerState.Loading)
    val state = _state.asStateFlow()

    private val id = checkNotNull(savedStateHandle.get<String>(ARG_ATTACHMENT_ID))
    private val isPhoto = savedStateHandle.get<Boolean>(ARG_VIEW_PHOTO) ?: false

    init {
        load()
    }

    fun retry() {
        if (_state.value == DocumentViewerState.Error) load()
    }

    private fun load() {
        _state.value = DocumentViewerState.Loading
        viewModelScope.launch {
            val preview = try {
                if (isPhoto) {
                    documentsRepository.photoForPreview(id)?.let {
                        DocumentViewerState.Ready(checkNotNull(it.localPath), it.mimeType, it.originalFilename)
                    }
                } else {
                    documentsRepository.attachmentForPreview(id)?.let {
                        DocumentViewerState.Ready(checkNotNull(it.localPath), it.mimeType, it.originalFilename)
                    }
                }
            } catch (failure: CancellationException) {
                throw failure
            } catch (_: Exception) {
                null
            }
            _state.value = preview ?: DocumentViewerState.Error
        }
    }
}
