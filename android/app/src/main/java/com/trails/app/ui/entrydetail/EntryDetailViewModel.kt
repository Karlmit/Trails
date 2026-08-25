package com.trails.app.ui.entrydetail

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class EntryDetailUiState(
    val entry: TimelineEntryEntity? = null,
    val typeDetails: Map<String, String> = emptyMap(),
    // User-requested redesign: every leg of a Transport entry -- see
    // TransportFlights.kt's own doc comment.
    val flights: List<FlightDraft> = emptyList(),
    val attachments: List<AttachmentEntity> = emptyList(),
    val photos: List<PhotoEntity> = emptyList(),
)

@HiltViewModel
class EntryDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val entryId: String = checkNotNull(savedStateHandle["entryId"])

    // Pull-to-refresh (user-requested) -- tripId is nullable here (the
    // route always supplies it, but this stays defensive rather than
    // crashing a detail screen over a gesture if it somehow doesn't).
    private val navTripId: String? = savedStateHandle["tripId"]
    private val refresher = navTripId?.let { TripRefresher(viewModelScope, it, syncScheduler) }
    val isRefreshing: StateFlow<Boolean> = refresher?.isRefreshing ?: MutableStateFlow(false)
    fun refresh() {
        refresher?.refresh()
    }

    fun uploadPhoto(uri: Uri, filename: String) {
        viewModelScope.launch {
            runCatching { documentsRepository.uploadPhoto("TIMELINE_ENTRY", entryId, uri, filename) }
        }
    }

    fun uploadAttachment(uri: Uri, filename: String) {
        viewModelScope.launch {
            val tripId = uiState.value.entry?.tripId ?: return@launch
            runCatching { documentsRepository.uploadAttachment(tripId, "TIMELINE_ENTRY", entryId, uri, filename) }
        }
    }

    /** Same on-demand retry-download as DocumentsScreen -- if the bulk sync pass missed this file, tapping it tries again before opening. */
    fun ensureCached(attachment: AttachmentEntity, onReady: (String) -> Unit) {
        if (attachment.localPath != null) {
            onReady(attachment.localPath)
            return
        }
        viewModelScope.launch {
            documentsRepository.ensureAttachmentCached(attachment)?.let(onReady)
        }
    }

    val uiState: StateFlow<EntryDetailUiState> = combine(
        timelineRepository.observeEntry(entryId),
        documentsRepository.observeAttachmentsForOwner("TIMELINE_ENTRY", entryId),
        documentsRepository.observePhotosForOwner("TIMELINE_ENTRY", entryId),
    ) { entry, attachments, photos ->
        EntryDetailUiState(
            entry = entry,
            typeDetails = parseFlatTypeDetails(entry?.typeDetailsJson),
            flights = parseFlights(entry?.typeDetailsJson),
            attachments = attachments,
            photos = photos,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), EntryDetailUiState())
}
