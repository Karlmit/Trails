package com.trails.app.ui.timeline

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.SectionEntity
import com.trails.app.data.entity.TimelineEntryEntity
import com.trails.app.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TimelineUiState(
    val sections: List<SectionEntity> = emptyList(),
    val entries: List<TimelineEntryEntity> = emptyList(),
    val isSyncing: Boolean = false,
)

@HiltViewModel
class TimelineViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val timelineRepository: TimelineRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    private val tripId: String = checkNotNull(savedStateHandle["tripId"]) { "TimelineScreen requires a tripId nav argument" }
    private val isSyncing = MutableStateFlow(false)

    val uiState: StateFlow<TimelineUiState> = combine(
        timelineRepository.observeSections(tripId),
        timelineRepository.observeEntries(tripId),
        isSyncing,
    ) { sections, entries, syncing ->
        TimelineUiState(sections = sections, entries = entries, isSyncing = syncing)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TimelineUiState())

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            isSyncing.value = true
            val workId = syncScheduler.syncTripNow(tripId)
            syncScheduler.observeWork(workId).first { it == null || it.state.isFinished }
            isSyncing.value = false
        }
    }
}
