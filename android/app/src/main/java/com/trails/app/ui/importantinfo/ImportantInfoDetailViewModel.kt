package com.trails.app.ui.importantinfo

import com.trails.app.R
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.isUsablePhotoCache
import com.trails.app.network.dto.LinkDto
import com.trails.app.network.dto.TagDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val OWNER_TYPE = "IMPORTANT_INFO"

data class InfoDetailItemState(val loaded: Boolean = false, val item: ImportantInfoEntity? = null)

@HiltViewModel
class ImportantInfoDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: ImportantInfoRepository,
    private val linksTagsRepository: LinksTagsRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val infoId: String = checkNotNull(savedStateHandle["infoId"])
    val itemState = repository.observeForTrip(tripId).map { list -> InfoDetailItemState(true, list.find { it.id == infoId }) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), InfoDetailItemState())
    val photos = documentsRepository.observePhotosForOwner(OWNER_TYPE, infoId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val attachments = documentsRepository.observeAttachmentsForOwner(OWNER_TYPE, infoId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val links = MutableStateFlow<List<LinkDto>>(emptyList())
    val tags = MutableStateFlow<List<TagDto>>(emptyList())
    val error = MutableStateFlow<String?>(null)
    val errorRes = MutableStateFlow<Int?>(null)

    init {
        viewModelScope.launch {
            photos.collect { list ->
                list.filterNot(::isUsablePhotoCache).forEach { documentsRepository.ensurePhotoCached(it) }
            }
        }
    }

    fun retryPhotos() {
        viewModelScope.launch {
            photos.value.filterNot(::isUsablePhotoCache).forEach { photo ->
                if (documentsRepository.ensurePhotoCached(photo) == null) errorRes.value = R.string.document_open_failed
            }
        }
    }

    fun refreshExtras() {
        viewModelScope.launch {
            error.value = null
            errorRes.value = null
            runCatching { linksTagsRepository.listLinks(OWNER_TYPE, infoId) }
                .onSuccess { links.value = it }.onFailure { error.value = it.message; errorRes.value = R.string.info_detail_extras_failed }
            runCatching { linksTagsRepository.listTags(OWNER_TYPE, infoId) }
                .onSuccess { tags.value = it }.onFailure { error.value = it.message; errorRes.value = R.string.info_detail_extras_failed }
        }
    }

    fun openAttachment(attachment: AttachmentEntity, onReady: (String) -> Unit) {
        viewModelScope.launch {
            runCatching { documentsRepository.ensureAttachmentCached(attachment) }
                .onSuccess { path ->
                    if (path != null) onReady(path) else errorRes.value = R.string.document_open_failed
                }
                .onFailure { error.value = it.message; errorRes.value = R.string.info_detail_extras_failed }
        }
    }
}
