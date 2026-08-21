package com.trails.app.ui.importantinfo

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.network.dto.ImportantInfoRequest
import com.trails.app.ui.components.LinkFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val OWNER_TYPE = "IMPORTANT_INFO"

data class ImportantInfoEditState(
    val infoId: String? = null,
    val title: String = "",
    val content: String = "",
    val locationName: String = "",
    val locationAddress: String = "",
    val locationMapLink: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val isPrivate: Boolean = false,
    val links: List<LinkFieldItem> = emptyList(),
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class ImportantInfoEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ImportantInfoRepository,
    private val linksTagsRepository: LinksTagsRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val infoId: String? = savedStateHandle.get<String>("infoId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(ImportantInfoEditState(infoId = infoId))
    val state: StateFlow<ImportantInfoEditState> = _state.asStateFlow()

    init {
        infoId?.let { ownerId ->
            viewModelScope.launch {
                runCatching { linksTagsRepository.listLinks(OWNER_TYPE, ownerId) }
                    .onSuccess { links -> _state.value = _state.value.copy(links = links.map { LinkFieldItem(it.id, it.url, it.label) }) }
            }
        }
    }

    fun addLink(url: String, label: String?) {
        val ownerId = _state.value.infoId
        if (ownerId == null) {
            _state.value = _state.value.copy(links = _state.value.links + LinkFieldItem(null, url, label))
            return
        }
        viewModelScope.launch {
            runCatching { linksTagsRepository.createLink(OWNER_TYPE, ownerId, url, label) }
                .onSuccess { created -> _state.value = _state.value.copy(links = _state.value.links + LinkFieldItem(created.id, created.url, created.label)) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to add link.") }
        }
    }

    fun removeLink(link: LinkFieldItem) {
        if (link.id == null) {
            _state.value = _state.value.copy(links = _state.value.links - link)
            return
        }
        viewModelScope.launch {
            runCatching { linksTagsRepository.deleteLink(link.id) }
                .onSuccess { _state.value = _state.value.copy(links = _state.value.links.filterNot { it.id == link.id }) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to remove link.") }
        }
    }

    fun loadIfEditing(all: List<ImportantInfoEntity>) {
        val existing = all.find { it.id == infoId } ?: return
        if (_state.value.title.isNotEmpty()) return
        _state.value = _state.value.copy(
            title = existing.title,
            content = existing.content.orEmpty(),
            locationName = existing.locationName.orEmpty(),
            locationAddress = existing.locationAddress.orEmpty(),
            locationMapLink = existing.locationMapLink.orEmpty(),
            contactName = existing.contactName.orEmpty(),
            contactPhone = existing.contactPhone.orEmpty(),
            contactEmail = existing.contactEmail.orEmpty(),
            isPrivate = existing.isPrivate,
        )
    }

    fun onTitleChange(value: String) { _state.value = _state.value.copy(title = value) }
    fun onContentChange(value: String) { _state.value = _state.value.copy(content = value) }
    fun onLocationNameChange(value: String) { _state.value = _state.value.copy(locationName = value) }
    fun onLocationAddressChange(value: String) { _state.value = _state.value.copy(locationAddress = value) }
    fun onLocationMapLinkChange(value: String) { _state.value = _state.value.copy(locationMapLink = value) }
    fun onContactNameChange(value: String) { _state.value = _state.value.copy(contactName = value) }
    fun onContactPhoneChange(value: String) { _state.value = _state.value.copy(contactPhone = value) }
    fun onContactEmailChange(value: String) { _state.value = _state.value.copy(contactEmail = value) }
    fun onIsPrivateChange(value: Boolean) { _state.value = _state.value.copy(isPrivate = value) }

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = "Title is required.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            val request = ImportantInfoRequest(
                tripId = tripId,
                title = current.title.trim(),
                content = current.content.trim().takeIf { it.isNotEmpty() },
                locationName = current.locationName.trim().takeIf { it.isNotEmpty() },
                locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
                locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
                contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                isPrivate = current.isPrivate,
            )
            runCatching {
                if (current.infoId == null) repository.create(request) else repository.update(current.infoId, request)
            }.onSuccess { result ->
                current.links.filter { it.id == null }.forEach { link ->
                    runCatching { linksTagsRepository.createLink(OWNER_TYPE, result.id, link.url, link.label) }
                }
                _state.value = _state.value.copy(saving = false, saved = true, infoId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save.")
            }
        }
    }

    fun delete() {
        val id = _state.value.infoId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.delete(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete.") }
        }
    }
}
