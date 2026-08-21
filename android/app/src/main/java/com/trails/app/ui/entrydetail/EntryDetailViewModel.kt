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
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

data class EntryDetailUiState(
    val entry: TimelineEntryEntity? = null,
    val typeDetails: Map<String, String> = emptyMap(),
    val attachments: List<AttachmentEntity> = emptyList(),
    val photos: List<PhotoEntity> = emptyList(),
)

@HiltViewModel
class EntryDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val entryId: String = checkNotNull(savedStateHandle["entryId"])

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
        EntryDetailUiState(entry = entry, typeDetails = parseTypeDetails(entry?.typeDetailsJson), attachments = attachments, photos = photos)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), EntryDetailUiState())

    private fun parseTypeDetails(json: String?): Map<String, String> {
        if (json.isNullOrBlank()) return emptyMap()
        return runCatching {
            (Json.parseToJsonElement(json) as JsonObject)
                .entries
                .associate { (key, value) -> key to value.jsonPrimitive.content }
        }.getOrDefault(emptyMap())
    }
}
