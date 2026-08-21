package com.trails.app.ui.blog

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.TimelineEntryEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
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

/** Mirrors app/(web)/trips/[tripId]/blog/[entryId]/page.tsx (plain-text body -- no rich rendering yet, see RichText.kt). */
@HiltViewModel
class BlogDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
) : ViewModel() {
    private val entryId: String = checkNotNull(savedStateHandle["entryId"])
    val entry: Flow<TimelineEntryEntity?> = timelineRepository.observeEntry(entryId)
}
