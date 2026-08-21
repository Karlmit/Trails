package com.trails.app.ui.blog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.entity.TimelineEntryEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class BlogListItem(val entry: TimelineEntryEntity, val excerpt: String)

/** Mirrors app/(web)/trips/[tripId]/blog/page.tsx -- server already excludes Draft posts from this list (AD-10). */
@HiltViewModel
class BlogListViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])

    val posts: StateFlow<List<BlogListItem>> = timelineRepository.observeEntries(tripId)
        .map { entries ->
            entries
                .filter { it.entryType == "BLOG_POST" }
                .sortedByDescending { it.startAt }
                .map { BlogListItem(it, extractPlainText(it.description).take(160)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}

data class BlogDetailUiState(
    val entry: TimelineEntryEntity? = null,
    val blocks: List<BlogBlock> = emptyList(),
    val photosById: Map<String, PhotoEntity> = emptyMap(),
)

/** Mirrors app/(web)/trips/[tripId]/blog/[entryId]/page.tsx -- text + inline images (BlogBlocks.kt), still no full BlockNote-equivalent formatting. */
@HiltViewModel
class BlogDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
    documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val entryId: String = checkNotNull(savedStateHandle["entryId"])

    val uiState: StateFlow<BlogDetailUiState> = combine(
        timelineRepository.observeEntry(entryId),
        documentsRepository.observePhotosForOwner("TIMELINE_ENTRY", entryId),
    ) { entry, photos ->
        BlogDetailUiState(
            entry = entry,
            blocks = parseBlogBlocks(entry?.description),
            photosById = photos.associateBy { it.id },
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), BlogDetailUiState())
}
