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
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
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
    private val timelineRepository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
) : ViewModel() {
    private val entryId: String = checkNotNull(savedStateHandle["entryId"])
    private val tripId: String? = savedStateHandle["tripId"]

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

    init {
        // A blog image's Photo can be missing here for two different reasons --
        // its metadata was never synced at all (this trip's last full sync
        // predates the image being added/uploaded), or the metadata synced but
        // the bytes download failed. Cover both: re-sync Photo metadata for the
        // whole trip once if any referenced photoId isn't known locally yet
        // (cheap -- Photo rows only, no file bytes), then always try to
        // download bytes for whatever's referenced and still missing a
        // localPath. Runs once per distinct set of missing ids, not on every
        // recomposition.
        viewModelScope.launch {
            var resyncedMetadata = false
            uiState.distinctUntilChanged { old, new -> old.blocks == new.blocks && old.photosById.keys == new.photosById.keys }
                .collect { state ->
                    val referencedIds = state.blocks.filterIsInstance<BlogBlock.ImageBlock>().map { it.photoId }.toSet()
                    if (referencedIds.isEmpty()) return@collect
                    val knownIds = state.photosById.keys
                    if (!resyncedMetadata && (referencedIds - knownIds).isNotEmpty() && tripId != null) {
                        resyncedMetadata = true
                        runCatching { documentsRepository.syncTrip(tripId) }
                    }
                    referencedIds.mapNotNull { state.photosById[it] }
                        .filter { it.localPath == null }
                        .forEach { photo -> runCatching { documentsRepository.ensurePhotoCached(photo) } }
                }
        }
    }
}
