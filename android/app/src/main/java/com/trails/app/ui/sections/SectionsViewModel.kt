package com.trails.app.ui.sections

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.SectionEntity
import com.trails.app.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SectionsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    timelineRepository: TimelineRepository,
    syncScheduler: SyncScheduler,
) : ViewModel() {
    private val tripId: String = checkNotNull(savedStateHandle["tripId"])
    val sections: Flow<List<SectionEntity>> = timelineRepository.observeSections(tripId)

    // See ChecklistsViewModel's identical init block -- this screen had no
    // sync trigger of its own before, only ever refreshed as a side effect
    // of the Timeline tab having synced first.
    init {
        viewModelScope.launch { syncScheduler.syncTripNow(tripId) }
    }
}
