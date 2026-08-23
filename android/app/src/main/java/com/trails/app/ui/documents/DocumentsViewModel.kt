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
import com.trails.app.ui.timeline.graph.ENTRY_TYPE_LABELS
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DocumentRow(val attachment: AttachmentEntity, val ownerTitle: String)
data class DocumentGroup(val label: String, val rows: List<DocumentRow>)

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

    val groups: StateFlow<List<DocumentGroup>> = combine(
        documentsRepository.observeAttachmentsForTrip(tripId),
        timelineRepository.observeEntries(tripId),
        importantInfoRepository.observeForTrip(tripId),
    ) { attachments, entries, importantInfoItems ->
        val entryById = entries.associateBy { it.id }
        val infoById = importantInfoItems.associateBy { it.id }
        val grouped = linkedMapOf<String, MutableList<DocumentRow>>()
        attachments.forEach { attachment ->
            val (label, title) = when (attachment.ownerType) {
                "TIMELINE_ENTRY" -> entryById[attachment.ownerId]?.let {
                    (ENTRY_TYPE_LABELS[it.entryType] ?: it.entryType) to it.title
                }
                "IMPORTANT_INFO" -> infoById[attachment.ownerId]?.let { "Important Info" to it.title }
                else -> null
            } ?: return@forEach
            grouped.getOrPut(label) { mutableListOf() }.add(DocumentRow(attachment, title))
        }
        grouped.map { (label, rows) -> DocumentGroup(label, rows) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val downloadingIds: StateFlow<Set<String>> = downloading

    /** Called when the user taps a not-yet-cached file -- returns the local path once available. */
    fun ensureCached(attachment: AttachmentEntity, onReady: (String) -> Unit) {
        if (attachment.localPath != null) {
            onReady(attachment.localPath)
            return
        }
        viewModelScope.launch {
            downloading.value = downloading.value + attachment.id
            val path = documentsRepository.ensureAttachmentCached(attachment)
            downloading.value = downloading.value - attachment.id
            if (path != null) onReady(path)
        }
    }
}
