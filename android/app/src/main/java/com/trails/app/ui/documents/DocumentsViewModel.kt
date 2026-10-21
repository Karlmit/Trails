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
import dagger.hilt.android.lifecycle.HiltViewModel
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
data class DocumentOpenError(val attachmentId: String)

internal class DownloadGate {
    private val active = mutableSetOf<String>()
    @Synchronized fun tryStart(id: String): Boolean = active.add(id)
    @Synchronized fun finish(id: String) { active.remove(id) }
}

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

    private val downloading = MutableStateFlow<Set<String>>(emptySet())
    private val downloadGate = DownloadGate()
    private val _openError = MutableStateFlow<DocumentOpenError?>(null)
    val openError: StateFlow<DocumentOpenError?> = _openError

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

    val downloadingIds: StateFlow<Set<String>> = downloading

    /** Called when the user taps a not-yet-cached file -- returns the local path once available. */
    fun ensureCached(attachment: AttachmentEntity, onReady: (String) -> Unit) {
        if (!downloadGate.tryStart(attachment.id)) return
        viewModelScope.launch {
            _openError.value = null
            downloading.value = downloading.value + attachment.id
            try {
                val path = documentsRepository.ensureAttachmentCached(attachment)
                if (path != null) onReady(path) else _openError.value = DocumentOpenError(attachment.id)
            } finally {
                downloading.value = downloading.value - attachment.id
                downloadGate.finish(attachment.id)
            }
        }
    }
}

sealed interface DocumentViewerState {
    data object Loading : DocumentViewerState
    data object Error : DocumentViewerState
    data class Ready(val attachment: AttachmentEntity) : DocumentViewerState
}

@HiltViewModel
class DocumentViewerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<DocumentViewerState>(DocumentViewerState.Loading)
    val state = _state.asStateFlow()

    init {
        val id = checkNotNull(savedStateHandle.get<String>("attachmentId"))
        viewModelScope.launch {
            _state.value = documentsRepository.getCachedAttachment(id)
                ?.let(DocumentViewerState::Ready) ?: DocumentViewerState.Error
        }
    }
}
