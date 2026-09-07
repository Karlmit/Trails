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
import com.trails.app.network.apiErrorMessage
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    // Added with URL import below: a pasted URL can fail for reasons the User
    // needs to read back ("That URL could not be reached", "not a supported
    // file type"), and this screen previously swallowed every upload failure
    // into a bare `runCatching {}` with nothing shown. Both intake paths now
    // report through here, so a failed *file* pick is no longer silent either.
    private val _importError = MutableStateFlow<String?>(null)
    val importError: StateFlow<String?> = _importError.asStateFlow()

    fun dismissImportError() {
        _importError.value = null
    }

    private fun reportFailure(error: Throwable) {
        _importError.value = error.apiErrorMessage() ?: error.message ?: GENERIC_IMPORT_FAILURE
    }

    fun uploadPhoto(uri: Uri, filename: String) {
        viewModelScope.launch {
            _importError.value = null
            runCatching { documentsRepository.uploadPhoto("TIMELINE_ENTRY", entryId, uri, filename) }
                .onFailure(::reportFailure)
        }
    }

    fun uploadAttachment(uri: Uri, filename: String) {
        viewModelScope.launch {
            val tripId = uiState.value.entry?.tripId ?: return@launch
            _importError.value = null
            runCatching { documentsRepository.uploadAttachment(tripId, "TIMELINE_ENTRY", entryId, uri, filename) }
                .onFailure(::reportFailure)
        }
    }

    /**
     * User-requested: "make it so anywhere I can upload a photo it's also
     * possible to just post an image URL, that way the user does not have to
     * actually download the photo first." The server fetches the bytes and
     * stores an ordinary Photo row, so nothing else on this screen changes --
     * the new photo simply appears in the same observed list.
     */
    fun importPhotoFromUrl(sourceUrl: String) {
        viewModelScope.launch {
            _importError.value = null
            runCatching { documentsRepository.importPhotoFromUrl("TIMELINE_ENTRY", entryId, sourceUrl) }
                .onFailure(::reportFailure)
        }
    }

    /** Same URL import for an Attachment -- PDFs included, same as the file picker. */
    fun importAttachmentFromUrl(sourceUrl: String) {
        viewModelScope.launch {
            _importError.value = null
            runCatching { documentsRepository.importAttachmentFromUrl("TIMELINE_ENTRY", entryId, sourceUrl) }
                .onFailure(::reportFailure)
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

// Last-resort text when a failure carries neither an API error envelope nor
// an exception message. Not a @StringRes: this ViewModel already reports
// dynamic strings (the server's own localized-by-the-server message) through
// `importError`, and adding a parallel @StringRes channel for one unlikely
// case would mean threading it through the screen for no real gain.
private const val GENERIC_IMPORT_FAILURE = "Could not add that file."
