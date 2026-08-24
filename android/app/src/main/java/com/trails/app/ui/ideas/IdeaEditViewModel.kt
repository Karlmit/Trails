package com.trails.app.ui.ideas

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.IdeaCategoryStore
import com.trails.app.data.IdeaRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.dto.IdeaRequest
import com.trails.app.network.dto.diffFields
import com.trails.app.network.dto.jsonStringOrNull
import com.trails.app.ui.components.LinkFieldItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject

private const val OWNER_TYPE = "IDEA"
private const val DEFAULT_CURRENCY = "SEK"

val IDEA_PRIORITIES = listOf("MUST_DO", "WOULD_LIKE", "MAYBE")
val IDEA_PRIORITY_LABELS = mapOf("MUST_DO" to "Must do", "WOULD_LIKE" to "Would like", "MAYBE" to "Maybe")
val IDEA_WEATHER_SUITABILITY = listOf("INDOOR", "OUTDOOR", "EITHER")
val IDEA_WEATHER_LABELS = mapOf("INDOOR" to "Indoor", "OUTDOOR" to "Outdoor", "EITHER" to "Either")

data class IdeaEditState(
    val ideaId: String? = null,
    val sectionId: String? = null,
    val title: String = "",
    val category: String? = null,
    // User-requested optional free text.
    val description: String = "",
    val priority: String = "WOULD_LIKE",
    val weatherSuitability: String = "EITHER",
    val locationAddress: String = "",
    val locationMapLink: String = "",
    val estimatedExpenseAmount: String = "",
    val estimatedExpenseCurrency: String = DEFAULT_CURRENCY,
    val links: List<LinkFieldItem> = emptyList(),
    val uploadingPhoto: Boolean = false,
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
    private val categoryStore: IdeaCategoryStore,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    private val ideaId: String? = savedStateHandle.get<String>("ideaId")?.takeUnless { it == "new" }

    private val _state = MutableStateFlow(IdeaEditState(ideaId = ideaId))
    val state: StateFlow<IdeaEditState> = _state.asStateFlow()

    // Captured right after `loadIfEditing` populates the existing Idea's
    // fields -- `save()` diffs against this so a PATCH only ever sends
    // fields the user actually changed on this screen (or that this
    // screen keeps synced with another field, like locationName tracking
    // title). Null for a create (nothing to diff against) or before
    // loading finishes.
    private var originalFields: Map<String, JsonElement>? = null

    private fun fieldsOf(s: IdeaEditState): Map<String, JsonElement> = mapOf(
        "sectionId" to (s.sectionId?.let { JsonPrimitive(it) } ?: JsonNull),
        "title" to JsonPrimitive(s.title.trim()),
        "category" to (s.category?.let { JsonPrimitive(it) } ?: JsonNull),
        "description" to jsonStringOrNull(s.description),
        "priority" to JsonPrimitive(s.priority),
        "weatherSuitability" to JsonPrimitive(s.weatherSuitability),
        // locationName always tracks title (see toRequest's comment) -- kept
        // in the diffed field set so a title-only edit still sends it.
        "locationName" to JsonPrimitive(s.title.trim()),
        "locationAddress" to jsonStringOrNull(s.locationAddress),
        "locationMapLink" to jsonStringOrNull(s.locationMapLink),
        "estimatedExpenseAmount" to (s.estimatedExpenseAmount.toDoubleOrNull()?.let { JsonPrimitive(it) } ?: JsonNull),
        "estimatedExpenseCurrency" to (
            s.estimatedExpenseCurrency.trim().takeIf { it.isNotEmpty() && s.estimatedExpenseAmount.isNotBlank() }
                ?.let { JsonPrimitive(it) } ?: JsonNull
            ),
    )

    // Same "in-flight create, don't fire a second one" guard as
    // BlogEditViewModel's own ensurePostId -- two photos added in quick
    // succession before the first upload's create call returns must share
    // that one create, not each lazily create their own Idea.
    private var creatingIdeaId: CompletableDeferred<String>? = null

    /** Every category any Idea on this Trip already uses, plus this device's own added-but-unused suggestions. */
    val categoryOptions: StateFlow<List<String>> = combine(
        repository.observeForTrip(tripId).map { ideas -> ideas.mapNotNull { it.category }.toSet() },
        categoryStore.observe(tripId),
    ) { used, stored -> (used + stored).sorted() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * Reactive to the CURRENT idea id, not just the constructor-time one --
     * creating an Idea keeps this same screen open (see [save]'s comment),
     * so a StateFlow bound once to the original (null) id would never pick
     * up the newly-created Idea's Photos, making "upload a cover photo"
     * look broken immediately after creating one.
     */
    val photos: StateFlow<List<PhotoEntity>> = _state
        .map { it.ideaId }
        .distinctUntilChanged()
        .flatMapLatest { id -> if (id != null) documentsRepository.observePhotosForOwner(OWNER_TYPE, id) else flowOf(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        // Links only ever load (and are only ever addable) once the Idea
        // exists -- user-reported: "Not possible to add Tags and Links when
        // not editing Idea." Unlike Entry/Idea's other resources, there is
        // deliberately no staging-before-creation path here.
        ideaId?.let { ownerId ->
            viewModelScope.launch {
                runCatching { linksTagsRepository.listLinks(OWNER_TYPE, ownerId) }
                    .onSuccess { links -> _state.value = _state.value.copy(links = links.map { LinkFieldItem(it.id, it.url, it.label) }) }
            }
        }
    }

    fun loadIfEditing(ideas: List<IdeaEntity>) {
        val existing = ideas.find { it.id == ideaId } ?: return
        if (_state.value.title.isNotEmpty()) return
        _state.value = _state.value.copy(
            sectionId = existing.sectionId,
            title = existing.title,
            category = existing.category,
            description = existing.description.orEmpty(),
            priority = existing.priority,
            weatherSuitability = existing.weatherSuitability,
            locationAddress = existing.locationAddress.orEmpty(),
            locationMapLink = existing.locationMapLink.orEmpty(),
            estimatedExpenseAmount = existing.estimatedExpenseAmount?.toString().orEmpty(),
            estimatedExpenseCurrency = existing.estimatedExpenseCurrency.orEmpty(),
        )
        originalFields = fieldsOf(_state.value)
    }

    fun onSectionChange(v: String?) { _state.value = _state.value.copy(sectionId = v) }
    fun onTitleChange(v: String) { _state.value = _state.value.copy(title = v) }
    fun onCategoryChange(v: String?) { _state.value = _state.value.copy(category = v) }
    fun onDescriptionChange(v: String) { _state.value = _state.value.copy(description = v) }
    fun onPriorityChange(v: String) { _state.value = _state.value.copy(priority = v) }
    fun onWeatherSuitabilityChange(v: String) { _state.value = _state.value.copy(weatherSuitability = v) }
    fun onLocationAddressChange(v: String) { _state.value = _state.value.copy(locationAddress = v) }
    fun onLocationMapLinkChange(v: String) { _state.value = _state.value.copy(locationMapLink = v) }
    fun onExpenseAmountChange(v: String) { _state.value = _state.value.copy(estimatedExpenseAmount = v) }
    fun onExpenseCurrencyChange(v: String) { _state.value = _state.value.copy(estimatedExpenseCurrency = v) }

    fun addCategoryOption(category: String) {
        viewModelScope.launch { categoryStore.add(tripId, category) }
    }

    fun removeCategoryOption(category: String) {
        viewModelScope.launch { categoryStore.remove(tripId, category) }
        if (_state.value.category == category) _state.value = _state.value.copy(category = null)
    }

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

    /** Lazily creates the Idea on the very first cover photo -- same convention as BlogEditViewModel's own ensurePostId. */
    private suspend fun ensureIdeaId(): String {
        _state.value.ideaId?.let { return it }
        creatingIdeaId?.let { return it.await() }

        val deferred = CompletableDeferred<String>()
        creatingIdeaId = deferred
        try {
            val current = _state.value
            val request = toRequest(current).copy(title = current.title.trim().ifEmpty { "Untitled" })
            val created = repository.create(request)
            _state.value = _state.value.copy(ideaId = created.id, title = _state.value.title.ifBlank { request.title })
            deferred.complete(created.id)
            return created.id
        } catch (e: Exception) {
            deferred.completeExceptionally(e)
            throw e
        } finally {
            creatingIdeaId = null
        }
    }

    fun uploadPhoto(uri: Uri, filename: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(uploadingPhoto = true, error = null)
            runCatching {
                val ownerId = ensureIdeaId()
                documentsRepository.uploadPhoto(OWNER_TYPE, ownerId, uri, filename)
            }.onSuccess {
                _state.value = _state.value.copy(uploadingPhoto = false)
            }.onFailure { e ->
                _state.value = _state.value.copy(uploadingPhoto = false, error = e.message ?: "Failed to upload photo.")
            }
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
        category = current.category,
        description = current.description.trim().takeIf { it.isNotEmpty() },
        priority = current.priority,
        weatherSuitability = current.weatherSuitability,
        // locationName removed from the form (redundant with Title, per
        // feedback) -- kept populated server-side from Title so anything
        // that reads Idea.locationName (e.g. a future Maps-link fallback)
        // still has a sensible value.
        locationName = current.title.trim(),
        locationAddress = current.locationAddress.trim().takeIf { it.isNotEmpty() },
        locationMapLink = current.locationMapLink.trim().takeIf { it.isNotEmpty() },
        // Only send currency when an amount is actually present -- the
        // server requires both or neither (hasEstimatedExpensePair), and
        // currency defaults to SEK in the UI even before an amount is
        // entered, so it must not be sent alone.
        estimatedExpenseAmount = current.estimatedExpenseAmount.toDoubleOrNull(),
        estimatedExpenseCurrency = current.estimatedExpenseCurrency.trim().takeIf { it.isNotEmpty() && current.estimatedExpenseAmount.isNotBlank() },
    )

    fun save() {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.value = current.copy(error = "Title is required.")
            return
        }
        // Currency defaults to SEK even with no amount entered (so it's
        // ready to go the moment someone *does* type an amount) -- so
        // "both or neither" only actually needs to check the direction
        // that can still fail: an amount with no currency. A currency
        // alone (still just the default, amount never touched) must not
        // block saving.
        if (current.estimatedExpenseAmount.isNotBlank() && current.estimatedExpenseCurrency.isBlank()) {
            _state.value = current.copy(error = "Estimated expense requires a currency.")
            return
        }
        _state.value = current.copy(saving = true, error = null)
        viewModelScope.launch {
            runCatching {
                if (current.ideaId == null) {
                    repository.create(toRequest(current))
                } else {
                    repository.update(current.ideaId, diffFields(originalFields, fieldsOf(current)))
                }
            }.onSuccess { result ->
                // Deliberately NOT navigating away here (state.saved isn't
                // watched by the screen) -- creating an Idea must stay on
                // this screen so Photos/Links become reachable right away,
                // same choice ChecklistEditScreen makes for items.
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
