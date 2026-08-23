package com.trails.app.ui.sections

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.SectionEntity
import com.trails.app.sync.SyncScheduler
import com.trails.app.sync.TripRefresher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class SectionsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val sections: Flow<List<SectionEntity>> = timelineRepository.observeSections(tripId)

    // This screen had no sync trigger of its own before, only ever
    // refreshed as a side effect of the Timeline tab having synced first --
    // now also drives the pull-to-refresh gesture (user-requested).
    private val refresher = TripRefresher(viewModelScope, tripId, syncScheduler)
    val isRefreshing: StateFlow<Boolean> = refresher.isRefreshing
    fun refresh() = refresher.refresh()

    init {
        refresh()
    }
}
