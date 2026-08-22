package com.trails.app.ui.ideas

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.IdeaRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.weatherTags
import com.trails.app.network.dto.IdeaRequest
import com.trails.app.ui.components.LinkFieldItem
import com.trails.app.ui.components.TagFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val OWNER_TYPE = "IDEA"

val IDEA_PRIORITIES = listOf("MUST_DO", "WOULD_LIKE", "MAYBE")
val IDEA_PRIORITY_LABELS = mapOf("MUST_DO" to "Must do", "WOULD_LIKE" to "Would like", "MAYBE" to "Maybe")
val IDEA_WEATHER_SUITABILITY = listOf("INDOOR", "OUTDOOR", "EITHER")
val IDEA_WEATHER_LABELS = mapOf("INDOOR" to "Indoor", "OUTDOOR" to "Outdoor", "EITHER" to "Either")

data class IdeaEditState(
    val ideaId: String? = null,
    val sectionId: String? = null,
    val title: String = "",
    val category: String = "",
    val priority: String = "WOULD_LIKE",
    val weatherSuitability: String = "EITHER",
    val weatherTags: List<String> = emptyList(),
    val locationName: String = "",
    val locationAddress: String = "",
    val estimatedExpenseAmount: String = "",
    val estimatedExpenseCurrency: String = "",
    val links: List<LinkFieldItem> = emptyList(),
    val tags: List<TagFieldItem> = emptyList(),
    val saving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
    val deleted: Boolean = false,
    val converted: Boolean = false,
)

@HiltViewModel
class IdeaEditViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: IdeaRepository,
    private val linksTagsRepository: LinksTagsRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val ideaId: String? = savedStateHandle.get<String>("ideaId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(IdeaEditState(ideaId = ideaId))
    val state: StateFlow<IdeaEditState> = _state.asStateFlow()

    /** Empty (and never populated) until the Idea actually exists -- Photos, like Links/Tags, are add-after-creation only. */
    val photos: StateFlow<List<PhotoEntity>> = ideaId
        ?.let { documentsRepository.observePhotosForOwner(OWNER_TYPE, it) }
        ?.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
        ?: MutableStateFlow(emptyList())

    init {
        // Links/Tags only ever load (and are only ever addable) once the
        // Idea exists -- user-reported: "Not possible to add Tags and Links
        // when not editing Idea." Unlike Entry/Idea's other resources, there
        // is deliberately no staging-before-creation path here.
        ideaId?.let { ownerId ->
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

    fun loadIfEditing(ideas: List<IdeaEntity>) {
        val existing = ideas.find { it.id == ideaId } ?: return
        if (_state.value.title.isNotEmpty()) return
        _state.value = _state.value.copy(
            sectionId = existing.sectionId,
            title = existing.title,
            category = existing.category.orEmpty(),
            priority = existing.priority,
            weatherSuitability = existing.weatherSuitability,
            weatherTags = existing.weatherTags,
            locationName = existing.locationName.orEmpty(),
            locationAddress = existing.locationAddress.orEmpty(),
            estimatedExpenseAmount = existing.estimatedExpenseAmount?.toString().orEmpty(),
            estimatedExpenseCurrency = existing.estimatedExpenseCurrency.orEmpty(),
        )
    }

    fun onSectionChange(v: String?) { _state.value = _state.value.copy(sectionId = v) }
    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onCategoryChange(v: String) { _state.value = _state.value.copy(category = v) }
    fun onPriorityChange(v: String) { _state.value = _state.value.copy(priority = v) }
    fun onWeatherSuitabilityChange(v: String) { _state.value = _state.value.copy(weatherSuitability = v) }
    fun onLocationNameChange(v: String) { _state.value = _state.value.copy(locationName = v) }
    fun onLocationAddressChange(v: String) { _state.value = _state.value.copy(locationAddress = v) }
    fun onExpenseAmountChange(v: String) { _state.value = _state.value.copy(estimatedExpenseAmount = v) }
    fun onExpenseCurrencyChange(v: String) { _state.value = _state.value.copy(estimatedExpenseCurrency = v) }

    fun addWeatherTag(tag: String) { _state.value = _state.value.copy(weatherTags = _state.value.weatherTags + tag) }
    fun removeWeatherTag(tag: String) { _state.value = _state.value.copy(weatherTags = _state.value.weatherTags - tag) }

    fun addLink(url: String, label: String?) {
        val ownerId = _state.value.ideaId ?: return
        viewModelScope.launch {
            runCatching { linksTagsRepository.createLink(OWNER_TYPE, ownerId, url, label) }
                .onSuccess { created -> _state.value = _state.value.copy(links = _state.value.links + LinkFieldItem(created.id, created.url, created.label)) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to add link.") }
        }
    }

    fun removeLink(link: LinkFieldItem) {
        val id = link.id ?: return
        viewModelScope.launch {
            runCatching { linksTagsRepository.deleteLink(id) }
                .onSuccess { _state.value = _state.value.copy(links = _state.value.links.filterNot { it.id == id }) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to remove link.") }
        }
    }

    fun addTag(text: String) {
        val ownerId = _state.value.ideaId ?: return
        viewModelScope.launch {
            runCatching { linksTagsRepository.createTag(OWNER_TYPE, ownerId, text) }
                .onSuccess { created -> _state.value = _state.value.copy(tags = _state.value.tags + TagFieldItem(created.id, created.text)) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to add tag.") }
        }
    }

    fun removeTag(tag: TagFieldItem) {
        viewModelScope.launch {
            runCatching { linksTagsRepository.deleteTag(tag.id) }
                .onSuccess { _state.value = _state.value.copy(tags = _state.value.tags.filterNot { it.id == tag.id }) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to remove tag.") }
        }
    }

    fun uploadPhoto(uri: Uri, filename: String) {
        val ownerId = _state.value.ideaId ?: return
        viewModelScope.launch {
            runCatching { documentsRepository.uploadPhoto(OWNER_TYPE, ownerId, uri, filename) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to upload photo.") }
        }
    }

    fun deletePhoto(photoId: String) {
        viewModelScope.launch {
            runCatching { documentsRepository.deletePhoto(photoId) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to delete photo.") }
        }
    }

    fun markPhotoPrimary(photoId: String) {
        viewModelScope.launch {
            runCatching { documentsRepository.markPhotoPrimary(photoId) }
                .onFailure { e -> _state.value = _state.value.copy(error = e.message ?: "Failed to set cover photo.") }
        }
    }

    private fun toRequest(current: IdeaEditState) = IdeaRequest(
        tripId = tripId,
        sectionId = current.sectionId,
        title = current.title.trim(),
        category = current.category.trim().takeIf { it.isNotEmpty() },
        priority = current.priority,
        weatherSuitability = current.weatherSuitability,
        weatherTags = current.weatherTags,
        locationName = current.locationName.trim().takeIf { it.isNotEmpty() },
        locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
        estimatedExpenseAmount = current.estimatedExpenseAmount.toDoubleOrNull(),
        estimatedExpenseCurrency = current.estimatedExpenseCurrency.trim().takeIf { it.isNotEmpty() },
    )

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = "Title is required.")
            return
        }
        if (current.estimatedExpenseAmount.isNotBlank() != current.estimatedExpenseCurrency.isNotBlank()) {
            _state.value = current.copy(error = "Estimated expense requires both an amount and a currency, or neither.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                if (current.ideaId == null) repository.create(toRequest(current)) else repository.update(current.ideaId, toRequest(current))
            }.onSuccess { result ->
                _state.value = _state.value.copy(saving = false, saved = true, ideaId = result.id)
            }.onFailure { e ->
                _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to save Idea.")
            }
        }
    }

    fun delete() {
        val id = _state.value.ideaId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.delete(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, deleted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to delete Idea.") }
        }
    }

    fun convertToEntry() {
        val id = _state.value.ideaId ?: return
        _state.value = _state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching { repository.convertToEntry(id) }
                .onSuccess { _state.value = _state.value.copy(saving = false, converted = true) }
                .onFailure { e -> _state.value = _state.value.copy(saving = false, error = e.message ?: "Failed to convert Idea.") }
        }
    }
}
