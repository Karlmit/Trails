package com.trails.app.ui.ideas

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.IdeaRepository
import com.trails.app.data.LinksTagsRepository
import com.trails.app.data.entity.IdeaEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.isUsablePhotoCache
import com.trails.app.network.dto.LinkDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val OWNER_TYPE = "IDEA"

/**
 * User-requested: tapping an Idea opens a read-only view first, same
 * view/edit split ChecklistDetailViewModel already established for
 * Checklists (mirrors components/IdeaCard.tsx's own view<->edit toggle) --
 * editing is IdeaEditScreen's job, reached via this screen's own Edit
 * button. Convert-to-Entry lives here (view mode), not on the edit screen,
 * matching IdeaCard.tsx exactly -- Delete stays edit-mode-only there too.
 */
@HiltViewModel
class IdeaDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: IdeaRepository,
    private val linksTagsRepository: LinksTagsRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val ideaId: String = checkNotNull(savedStateHandle["ideaId"])

    val idea: StateFlow<IdeaEntity?> = repository.observeForTrip(tripId)
        .map { list -> list.find { it.id == ideaId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val photos: StateFlow<List<PhotoEntity>> = documentsRepository.observePhotosForOwner(OWNER_TYPE, ideaId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _links = MutableStateFlow<List<LinkDto>>(emptyList())
    val links: StateFlow<List<LinkDto>> = _links

    init {
        viewModelScope.launch {
            photos.collect { ownerPhotos ->
                ownerPhotos.filterNot(::isUsablePhotoCache).forEach { documentsRepository.ensurePhotoCached(it) }
            }
        }
        // Links only ever exist for a real (non-"new") Idea -- always true
        // here, this screen only ever shows an existing one.
        viewModelScope.launch {
            runCatching { linksTagsRepository.listLinks(OWNER_TYPE, ideaId) }
                .onSuccess { _links.value = it }
        }
    }
}
