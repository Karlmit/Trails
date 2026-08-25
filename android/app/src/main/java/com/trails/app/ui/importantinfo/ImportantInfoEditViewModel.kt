package com.trails.app.ui.importantinfo

import android.net.Uri
import androidx.annotation.StringRes
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.R
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.ImportantInfoRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.ImportantInfoEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.dto.ImportantInfoRequest
import com.trails.app.network.dto.diffFields
import com.trails.app.network.dto.jsonStringOrNull
import com.trails.app.ui.components.LinkFieldItem
import com.trails.app.ui.components.TagFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject

private const val OWNER_TYPE = "IMPORTANT_INFO"

data class ImportantInfoEditState(
    val infoId: String? = null,
    val title: String = "",
    val content: String = "",
    val emoji: String = "",
    val locationName: String = "",
    val locationAddress: String = "",
    val locationMapLink: String = "",
    val contactName: String = "",
    val contactPhone: String = "",
    val contactEmail: String = "",
    val isPrivate: Boolean = false,
    val links: List<LinkFieldItem> = emptyList(),
    val tags: List<TagFieldItem> = emptyList(),
    val uploadingPhoto: Boolean = false,
    val saving: Boolean = false,
    // Dynamic, server-provided error text (e.g. from a thrown exception) --
    // takes precedence over [errorRes] when non-null.
    val error: String? = null,
    // Known, statically-translated error case -- resolved to text by the
    // Composable via stringResource(), since a ViewModel can't call it.
    @StringRes val errorRes: Int? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class ImportantInfoEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ImportantInfoRepository,
    private val linksTagsRepository: LinksTagsRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val infoId: String? = savedStateHandle.get<String>("infoId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(ImportantInfoEditState(infoId = infoId))
    val state: StateFlow<ImportantInfoEditState> = _state.asStateFlow()

    // Captured right after `loadIfEditing` populates the existing item's
    // fields -- `save()` diffs against this so a PATCH only ever sends
    // fields the user actually changed on this screen. Null for a create
    // (nothing to diff against) or before loading finishes.
    private var originalFields: Map<String, JsonElement>? = null

    private fun fieldsOf(s: ImportantInfoEditState): Map<String, JsonElement> = mapOf(
        "title" to JsonPrimitive(s.title.trim()),
        "content" to jsonStringOrNull(s.content),
        "emoji" to jsonStringOrNull(s.emoji),
        "locationName" to jsonStringOrNull(s.locationName),
        "locationAddress" to jsonStringOrNull(s.locationAddress),
        "locationMapLink" to jsonStringOrNull(s.locationMapLink),
        "contactName" to jsonStringOrNull(s.contactName),
        "contactPhone" to jsonStringOrNull(s.contactPhone),
        "contactEmail" to jsonStringOrNull(s.contactEmail),
        "isPrivate" to JsonPrimitive(s.isPrivate),
    )

    // User-requested: Tags/Links/Documents/Photos are only addable once
    // this item exists -- same "no staging before creation" constraint as
    // IdeaEditViewModel's own Tags/Links (a Tag/Link/Attachment/Photo needs
    // a real ownerId to attach to), and unlike Idea there is no lazy-create
    // path here either (ImportantInfo's own create form has nothing that
    // would need one, e.g. no cover-photo-before-save flow).
    val attachments: StateFlow<List<AttachmentEntity>> =
        (infoId?.let { documentsRepository.observeAttachmentsForOwner(OWNER_TYPE, it) } ?: flowOf(emptyList()))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val photos: StateFlow<List<PhotoEntity>> =
        (infoId?.let { documentsRepository.observePhotosForOwner(OWNER_TYPE, it) } ?: flowOf(emptyList()))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        infoId?.let { ownerId ->
            viewModelScope.launch {
                runCatching { linksTagsRepository.listLinks(OWNER_TYPE, ownerId) }
                    .onSuccess { links -> _state.value = _state.value.copy(links = links.map { LinkFieldItem(it.id, it.url, it.label) }) }
            }
            viewModelScope.launch {
                runCatching { linksTagsRepository.listTags(OWNER_TYPE, ownerId) }
                    .onSuccess { tags -> _state.value = _state.value.copy(tags = tags.map { TagFieldItem(it.id, it.text) }) }
            }
        }
    }

    fun addTag(text: String) {
        val ownerId = infoId ?: return
        viewModelScope.launch {
            runCatching { linksTagsRepository.createTag(OWNER_TYPE, ownerId, text) }
                .onSuccess { created -> _state.value = _state.value.copy(tags = _state.value.tags + TagFieldItem(created.id, created.text)) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_add_tag_failed else null) }
        }
    }

    fun removeTag(tag: TagFieldItem) {
        viewModelScope.launch {
            runCatching { linksTagsRepository.deleteTag(tag.id) }
                .onSuccess { _state.value = _state.value.copy(tags = _state.value.tags.filterNot { it.id == tag.id }) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_remove_tag_failed else null) }
        }
    }

    fun uploadPhoto(uri: Uri, filename: String) {
        val ownerId = infoId ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingPhoto = true, error = null, errorRes = null)
            runCatching { documentsRepository.uploadPhoto(OWNER_TYPE, ownerId, uri, filename) }
                .onSuccess { _state.value = _state.value.copy(uploadingPhoto = false) }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        uploadingPhoto = false,
                        error = e.message,
                        errorRes = if (e.message == null) R.string.info_error_upload_photo_failed else null,
                    )
                }
        }
    }

    fun deletePhoto(photoId: String) {
        viewModelScope.launch {
            runCatching { documentsRepository.deletePhoto(photoId) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_delete_photo_failed else null) }
        }
    }

    fun uploadAttachment(uri: Uri, filename: String) {
        val ownerId = infoId ?: return
        viewModelScope.launch {
            runCatching { documentsRepository.uploadAttachment(tripId, OWNER_TYPE, ownerId, uri, filename) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_upload_document_failed else null) }
        }
    }

    /** Same on-demand retry-download as DocumentsScreen/EntryDetailScreen -- if the bulk sync pass missed this file, tapping it tries again before opening. */
    fun ensureAttachmentCached(attachment: AttachmentEntity, onReady: (String) -> Unit) {
        if (attachment.localPath != null) {
            onReady(attachment.localPath)
            return
        }
        viewModelScope.launch {
            documentsRepository.ensureAttachmentCached(attachment)?.let(onReady)
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
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_add_link_failed else null) }
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
                .onFailure { e -> _state.value = _state.value.copy(error = e.message, errorRes = if (e.message == null) R.string.info_error_remove_link_failed else null) }
        }
    }

    fun loadIfEditing(all: List<ImportantInfoEntity>) {
        val existing = all.find { it.id == infoId } ?: return
        if (_state.value.title.isNotEmpty()) return
        _state.value = _state.value.copy(
            title = existing.title,
            content = existing.content.orEmpty(),
            emoji = existing.emoji.orEmpty(),
            locationName = existing.locationName.orEmpty(),
            locationAddress = existing.locationAddress.orEmpty(),
            locationMapLink = existing.locationMapLink.orEmpty(),
            contactName = existing.contactName.orEmpty(),
            contactPhone = existing.contactPhone.orEmpty(),
            contactEmail = existing.contactEmail.orEmpty(),
            isPrivate = existing.isPrivate,
        )
        originalFields = fieldsOf(_state.value)
    }

    fun onTitleChange(value: String) { _state.value = _state.value.copy(title = value) }
    fun onContentChange(value: String) { _state.value = _state.value.copy(content = value) }
    fun onEmojiChange(value: String) { _state.value = _state.value.copy(emoji = value) }
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
            _state.value = current.copy(error = null, errorRes = R.string.info_error_title_required)
            return
        }
        _state.value = current.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            runCatching {
                if (current.infoId == null) {
                    repository.create(
                        ImportantInfoRequest(
                            tripId = tripId,
                            title = current.title.trim(),
                            content = current.content.trim().takeIf { it.isNotEmpty() },
                            emoji = current.emoji.trim().takeIf { it.isNotEmpty() },
                            locationName = current.locationName.trim().takeIf { it.isNotEmpty() },
                            locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
                            locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
                            contactName = current.contactName.trim().takeIf { it.isNotEmpty() },
                            contactPhone = current.contactPhone.trim().takeIf { it.isNotEmpty() },
                            contactEmail = current.contactEmail.trim().takeIf { it.isNotEmpty() },
                            isPrivate = current.isPrivate,
                        ),
                    )
                } else {
                    repository.update(current.infoId, diffFields(originalFields, fieldsOf(current)))
                }
            }.onSuccess { result ->
                current.links.filter { it.id == null }.forEach { link ->
                    runCatching { linksTagsRepository.createLink(OWNER_TYPE, result.id, link.url, link.label) }
                }
                _state.value = _state.value.copy(saving = false, saved = true, infoId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(
                    saving = false,
                    error = e.message,
                    errorRes = if (e.message == null) R.string.info_error_save_failed else null,
                )
            }
        }
    }

    fun delete() {
        val id = _state.value.infoId ?: return
        _state.value = _state.value.copy(saving = true, error = null, errorRes = null)
        viewModelScope.launch {
            runCatching { repository.delete(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e ->
                    _state.value = _state.value.copy(
                        saving = false,
                        error = e.message,
                        errorRes = if (e.message == null) R.string.info_error_delete_failed else null,
                    )
                }
        }
    }
}
