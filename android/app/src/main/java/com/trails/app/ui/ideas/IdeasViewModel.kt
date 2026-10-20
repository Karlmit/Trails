package com.trails.app.ui.ideas

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.IdeaRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.SectionEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One Ideas-list group -- a Section (in the Trip's own Section order) or the trailing "No Section" bucket. */
data class IdeaGroup(val section: SectionEntity?, val ideas: List<IdeaWithCoverPhoto>)
data class IdeaWithCoverPhoto(val idea: IdeaEntity, val coverPhoto: PhotoEntity?)

/** Selects the same primary-first, newest-fallback cover used by the web Ideas list. */
internal fun ideaCoverPhotos(
    ideas: List<IdeaEntity>,
    photos: List<PhotoEntity>,
): Map<String, PhotoEntity> {
    val ideaIds = ideas.mapTo(mutableSetOf()) { it.id }
    return photos
        .asSequence()
        .filter { it.ownerType == "IDEA" && it.ownerId in ideaIds }
        .groupBy { it.ownerId }
        .mapValues { (_, ownerPhotos) ->
            ownerPhotos.filter { it.isPrimary }.maxByOrNull { it.createdAt }
                ?: ownerPhotos.maxBy { it.createdAt }
        }
}

internal suspend fun ensureIdeaCoversCached(
    ideas: List<IdeaEntity>,
    photos: List<PhotoEntity>,
    cachePhoto: suspend (PhotoEntity) -> Unit,
) {
    ideaCoverPhotos(ideas, photos).values
        .forEach { cachePhoto(it) }
}

internal fun ideasWithoutKnownSection(
    ideas: List<IdeaEntity>,
    sections: List<SectionEntity>,
): List<IdeaEntity> {
    val knownSectionIds = sections.mapTo(mutableSetOf()) { it.id }
    return ideas.filter { it.sectionId == null || it.sectionId !in knownSectionIds }
}

/** lib/ideas.ts::IdeaFilters -- null means "no filter on this field," same as an omitted query param there. */
data class IdeaFilters(
    val priority: String? = null,
    val sectionId: String? = null,
    val category: String? = null,
    val weatherSuitability: String? = null,
)

@HiltViewModel
class IdeasViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: IdeaRepository,
    timelineRepository: TimelineRepository,
    documentsRepository: DocumentsRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val ideas: Flow<List<IdeaEntity>> = repository.observeForTrip(tripId)
    private val photos: Flow<List<PhotoEntity>> = documentsRepository.observePhotosForTrip(tripId)

    // See ChecklistsViewModel's identical init block -- this screen had no
    // sync trigger of its own before, only ever refreshed as a side effect
    // of the Timeline tab having synced first. Now also drives the
    // pull-to-refresh gesture (user-requested).
    private val refresher = TripRefresher(viewModelScope, tripId, syncScheduler)
    val isRefreshing: StateFlow<Boolean> = refresher.isRefreshing
    fun refresh() = refresher.refresh()

    init {
        refresh()

        // A full sync normally caches every photo, but individual download
        // failures are deliberately non-fatal. Web-added covers would then
        // remain metadata-only and the list used to hide them forever. Retry
        // the small set of selected covers on demand; Room emits again after
        // ensurePhotoCached stores the path, so the existing File-backed UI
        // appears automatically and remains available offline.
        viewModelScope.launch {
            combine(ideas, photos, isRefreshing) { ideaList, photoList, refreshing ->
                Triple(ideaList, photoList, refreshing)
            }.collect { (ideaList, photoList, refreshing) ->
                // TripSyncCoordinator downloads all missing photos. Waiting
                // for it prevents two writers from fetching the same cover
                // into the same cache file; this pass handles only whatever
                // the completed bulk sync could not cache.
                if (!refreshing) {
                    ensureIdeaCoversCached(ideaList, photoList) { photo ->
                        documentsRepository.ensurePhotoCached(photo)
                    }
                }
            }
        }
    }

    private val _filters = MutableStateFlow(IdeaFilters())
    val filters: StateFlow<IdeaFilters> = _filters.asStateFlow()

    fun onPriorityFilterChange(value: String?) { _filters.value = _filters.value.copy(priority = value) }
    fun onSectionFilterChange(value: String?) { _filters.value = _filters.value.copy(sectionId = value) }
    fun onCategoryFilterChange(value: String?) { _filters.value = _filters.value.copy(category = value) }
    fun onWeatherFilterChange(value: String?) { _filters.value = _filters.value.copy(weatherSuitability = value) }
    fun clearFilters() { _filters.value = IdeaFilters() }

    /** lib/ideas.ts::distinctCategories */
    val categoryOptions: StateFlow<List<String>> = ideas
        .map { list -> list.mapNotNull { it.category }.toSet().sorted() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Unfiltered -- distinguishes "no Ideas at all" from "filtered to nothing" for the empty state. */
    val hasAnyIdeas: StateFlow<Boolean> = ideas
        .map { it.isNotEmpty() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    /**
     * Grouped by Section in the Trip's own Section order, with a trailing
     * "No Section" group for anything unassigned -- user-reported: "Sort
     * ideas by section per default." Each group's own Ideas keep their
     * existing createdAt-ascending order (IdeaDao.observeForTrip). Filtered
     * by Priority/Section/Category/Weather suitability first -- same pure
     * predicate as lib/ideas.ts::filterIdeas, applied via [filters].
     */
    val groups: StateFlow<List<IdeaGroup>> = combine(
        ideas,
        timelineRepository.observeSections(tripId),
        photos,
        _filters,
    ) { ideaList, sections, photos, filters ->
        val filtered = ideaList.filter { idea ->
            (filters.priority == null || idea.priority == filters.priority) &&
                (filters.sectionId == null || idea.sectionId == filters.sectionId) &&
                (filters.category == null || idea.category == filters.category) &&
                (filters.weatherSuitability == null || idea.weatherSuitability == filters.weatherSuitability)
        }
        val coverPhotoByIdeaId = ideaCoverPhotos(ideaList, photos)
        val sortedSections = sections.sortedBy { it.startDate }
        val bySectionId = filtered.groupBy { it.sectionId }
        val sectioned = sortedSections.mapNotNull { section ->
            val sectionIdeas = bySectionId[section.id].orEmpty()
            if (sectionIdeas.isEmpty()) null
            else IdeaGroup(section, sectionIdeas.map { IdeaWithCoverPhoto(it, coverPhotoByIdeaId[it.id]) })
        }
        // Match the web list: an Idea whose Section has not synced yet must
        // remain visible in the trailing bucket instead of being dropped.
        val unsectioned = ideasWithoutKnownSection(filtered, sortedSections)
        val trailing = if (unsectioned.isEmpty()) emptyList() else listOf(IdeaGroup(null, unsectioned.map { IdeaWithCoverPhoto(it, coverPhotoByIdeaId[it.id]) }))
        sectioned + trailing
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
