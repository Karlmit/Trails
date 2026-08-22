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
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** One Ideas-list group -- a Section (in the Trip's own Section order) or the trailing "No Section" bucket. */
data class IdeaGroup(val section: SectionEntity?, val ideas: List<IdeaWithCoverPhoto>)
data class IdeaWithCoverPhoto(val idea: IdeaEntity, val coverPhoto: PhotoEntity?)

@HiltViewModel
class IdeasViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    repository: IdeaRepository,
    timelineRepository: TimelineRepository,
    documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val ideas: Flow<List<IdeaEntity>> = repository.observeForTrip(tripId)

    /**
     * Grouped by Section in the Trip's own Section order, with a trailing
     * "No Section" group for anything unassigned -- user-reported: "Sort
     * ideas by section per default." Each group's own Ideas keep their
     * existing createdAt-ascending order (IdeaDao.observeForTrip).
     */
    val groups: StateFlow<List<IdeaGroup>> = combine(
        ideas,
        timelineRepository.observeSections(tripId),
        documentsRepository.observePhotosForTrip(tripId),
    ) { ideaList, sections, photos ->
        val coverPhotoByIdeaId = photos
            .filter { it.ownerType == "IDEA" }
            .groupBy { it.ownerId }
            .mapValues { (_, ownerPhotos) -> ownerPhotos.find { it.isPrimary } ?: ownerPhotos.firstOrNull() }
        val sortedSections = sections.sortedBy { it.startDate }
        val bySectionId = ideaList.groupBy { it.sectionId }
        val sectioned = sortedSections.mapNotNull { section ->
            val sectionIdeas = bySectionId[section.id].orEmpty()
            if (sectionIdeas.isEmpty()) null
            else IdeaGroup(section, sectionIdeas.map { IdeaWithCoverPhoto(it, coverPhotoByIdeaId[it.id]) })
        }
        val unsectioned = bySectionId[null].orEmpty()
        val trailing = if (unsectioned.isEmpty()) emptyList() else listOf(IdeaGroup(null, unsectioned.map { IdeaWithCoverPhoto(it, coverPhotoByIdeaId[it.id]) }))
        sectioned + trailing
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
